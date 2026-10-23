import { db, CloneItem, Product, AutomationProduct } from './db';
import { parseShopeeUrl, convertShopeeLink } from './shopee';
import { formatWhatsAppMessage } from './message-formatter';

export class CloneService {
  private static isProcessing = false;

  /**
   * Main polling routine: listens for recent incoming WhatsApp messages,
   * runs anti-loop validations, converts Shopee links with own credentials,
   * and queues items according to clone mode.
   */
  public static async pollAndProcess(): Promise<{
    processed: number;
    captured: number;
    ignored: number;
    errors: number;
    messages: string[];
  }> {
    if (this.isProcessing) {
      return {
        processed: 0,
        captured: 0,
        ignored: 0,
        errors: 0,
        messages: ['CloneService já está processando um ciclo de mensagens.'],
      };
    }

    this.isProcessing = true;
    const logMessages: string[] = [];
    let capturedCount = 0;
    let ignoredCount = 0;
    let errorCount = 0;

    try {
      const data = db.read();
      const config = data.clone_config;

      if (!config || !config.active) {
        return {
          processed: 0,
          captured: 0,
          ignored: 0,
          errors: 0,
          messages: ['Monitoramento Clone está desativado.'],
        };
      }

      if (!config.sourceGroupJid) {
        return {
          processed: 0,
          captured: 0,
          ignored: 0,
          errors: 0,
          messages: ['Nenhum grupo de origem configurado para o Clone.'],
        };
      }

      // 1. Determine since timestamp: only process messages after activation and newer than last processed
      const activatedTimestamp = config.activatedAt ? new Date(config.activatedAt).getTime() : 0;
      const lastProcessedTimestamp = config.lastProcessedTimestamp || 0;
      const minTimestamp = Math.max(activatedTimestamp, lastProcessedTimestamp);

      // 2. Fetch incoming messages from WhatsApp worker
      const workerUrl = process.env.WHATSAPP_WORKER_URL || 'http://127.0.0.1:8080';
      const apiKey = process.env.WHATSAPP_WORKER_API_KEY || 'afiliado-auto-secret-key-2026';
      const targetJid = config.sourceGroupJid;

      let incomingMessages: Array<{
        id: string;
        remoteJid: string;
        fromMe: boolean;
        participant?: string;
        pushName?: string;
        text: string;
        timestamp: number;
      }> = [];

      try {
        const queryUrl = `${workerUrl}/messages/recent/afiliado-auto?jid=${encodeURIComponent(
          targetJid
        )}&since=${minTimestamp}&limit=50`;

        const res = await fetch(queryUrl, {
          headers: { apikey: apiKey },
        });

        if (res.ok) {
          const resData = await res.json();
          if (Array.isArray(resData.messages)) {
            incomingMessages = resData.messages;
          }
        } else {
          logMessages.push(`Falha ao consultar worker WhatsApp: status ${res.status}`);
        }
      } catch (err: any) {
        console.error('[Clone] Erro ao buscar mensagens no worker:', err.message);
        return {
          processed: 0,
          captured: 0,
          ignored: 0,
          errors: 1,
          messages: [`Erro de conexão com o WhatsApp worker: ${err.message}`],
        };
      }

      if (incomingMessages.length === 0) {
        return {
          processed: 0,
          captured: 0,
          ignored: 0,
          errors: 0,
          messages: ['Nenhuma nova mensagem recebida no grupo monitorado.'],
        };
      }

      // Sort messages chronologically (oldest to newest)
      incomingMessages.sort((a, b) => a.timestamp - b.timestamp);

      // Collect all destination groups from active automations
      const destinationGroupJids = new Set<string>();
      data.automations.forEach((auto) => {
        if (auto.targetGroups) {
          auto.targetGroups.forEach((jid) => destinationGroupJids.add(jid));
        }
        if (auto.configurationGroupId) {
          const cfg = data.configuration_groups.find((c) => c.id === auto.configurationGroupId);
          if (cfg) {
            cfg.groupJids.forEach((jid) => destinationGroupJids.add(jid));
          }
        }
      });

      const knownSentMessageIds = new Set<string>(
        data.message_jobs.map((j) => j.provider_message_id).filter(Boolean) as string[]
      );

      const antiLoopWindowMs = (config.antiLoopHours || 24) * 60 * 60 * 1000;
      const nowMs = Date.now();
      let maxProcessedTimestamp = config.lastProcessedTimestamp || 0;
      let lastProcessedMsgId = config.lastProcessedMessageId || null;

      const urlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/gi;
      const shopeeDomainRegex = /(shopee\.com\.br|shope\.ee|s\.shopee\.com\.br|shp\.ee|collshp\.com)/i;

      for (const msg of incomingMessages) {
        if (msg.timestamp <= minTimestamp) {
          continue;
        }

        maxProcessedTimestamp = Math.max(maxProcessedTimestamp, msg.timestamp);
        lastProcessedMsgId = msg.id;

        const sourceGroupJid = msg.remoteJid;
        const sourceMessageId = msg.id;
        const sourceTimestamp = msg.timestamp;

        // Anti-Loop Rule 1: Ignore messages sent by Afiliado Auto itself / self WhatsApp
        if (msg.fromMe) {
          ignoredCount++;
          logMessages.push(`[Anti-Loop] Mensagem ${msg.id} ignorada: enviada pelo próprio WhatsApp (fromMe=true).`);
          this.recordIgnoredItem(sourceGroupJid, sourceMessageId, sourceTimestamp, '', 'Mensagem enviada pelo próprio usuário/WhatsApp');
          continue;
        }

        // Anti-Loop Rule 2: Ignore messages that match any job sent by Afiliado Auto
        if (knownSentMessageIds.has(msg.id)) {
          ignoredCount++;
          logMessages.push(`[Anti-Loop] Mensagem ${msg.id} ignorada: disparo originado pelo Afiliado Auto.`);
          this.recordIgnoredItem(sourceGroupJid, sourceMessageId, sourceTimestamp, '', 'Disparo originado pelo Afiliado Auto');
          continue;
        }

        // Anti-Loop Rule 3: Ignore if message origin is a configured destination group
        if (destinationGroupJids.has(sourceGroupJid)) {
          ignoredCount++;
          logMessages.push(`[Anti-Loop] Mensagem ${msg.id} ignorada: grupo de origem é um grupo de destino configurado.`);
          this.recordIgnoredItem(sourceGroupJid, sourceMessageId, sourceTimestamp, '', 'Mensagem originada de grupo de destino configurado');
          continue;
        }

        // Extract URLs from message text
        const matches = msg.text.match(urlRegex);
        if (!matches || matches.length === 0) {
          continue; // Plain chatter, skip without clutter
        }

        const shopeeUrls = matches.filter((u) => shopeeDomainRegex.test(u));
        if (shopeeUrls.length === 0) {
          ignoredCount++;
          this.recordIgnoredItem(sourceGroupJid, sourceMessageId, sourceTimestamp, matches[0], 'Nenhum link Shopee identificado na mensagem');
          continue;
        }

        // Process each Shopee URL found in the competitor's message
        for (const rawUrl of shopeeUrls) {
          const parsed = parseShopeeUrl(rawUrl);
          if (!parsed) {
            ignoredCount++;
            this.recordIgnoredItem(sourceGroupJid, sourceMessageId, sourceTimestamp, rawUrl, 'URL Shopee inválida ou malformada');
            continue;
          }

          // Anti-Loop Rule 4: Check if this captured URL was already processed
          const currentData = db.read();
          const alreadyCaptured = (currentData.clone_items || []).some(
            (ci) =>
              ci.capturedUrl === rawUrl &&
              (ci.status === 'approved' || ci.status === 'auto_added' || ci.status === 'waiting_approval')
          );
          if (alreadyCaptured) {
            ignoredCount++;
            logMessages.push(`[Anti-Loop] Link ${rawUrl} ignorado: já capturado anteriormente.`);
            this.recordIgnoredItem(sourceGroupJid, sourceMessageId, sourceTimestamp, rawUrl, 'Link já capturado anteriormente');
            continue;
          }

          try {
            // Anti-Loop Rule 5 & Shopee Conversion:
            // ALWAYS resolve canonical product and generate OWN affiliate link with configured Sub IDs.
            // NEVER reuse competitor's affiliate link!
            const cleanSubIds = (config.subIds || []).map((s) => s.trim().replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean).slice(0, 5);
            const conversion = await convertShopeeLink(parsed, cleanSubIds);

            if (!conversion.success) {
              errorCount++;
              this.recordErrorItem(sourceGroupJid, sourceMessageId, sourceTimestamp, rawUrl, conversion.error || 'Falha ao converter link Shopee');
              continue;
            }

            const itemId = conversion.itemId || parsed.itemId || null;
            const shopId = conversion.shopId || parsed.shopId || null;

            // Anti-Loop Rule 6: Check same itemId within configurable period (e.g. 24h)
            if (itemId) {
              const recentDuplicate = (currentData.clone_items || []).some((ci) => {
                if (ci.itemId === itemId && (ci.status === 'approved' || ci.status === 'auto_added' || ci.status === 'waiting_approval')) {
                  const itemTime = new Date(ci.createdAt).getTime();
                  return nowMs - itemTime < antiLoopWindowMs;
                }
                return false;
              });

              if (recentDuplicate) {
                ignoredCount++;
                const reason = `Produto (${itemId}) já clonado nas últimas ${config.antiLoopHours || 24}h`;
                logMessages.push(`[Anti-Loop] ${reason}`);
                this.recordIgnoredItem(sourceGroupJid, sourceMessageId, sourceTimestamp, rawUrl, reason);
                continue;
              }
            }

            // Standard Template Reconstruction:
            // Reconstruct the message using Afiliado Auto standard template (DO NOT copy competitor promotional text!)
            const formattedMessage = formatWhatsAppMessage({
              product: {
                productName: conversion.productName,
                affiliateLink: conversion.affiliateUrl,
                priceMin: conversion.priceMin,
                originalPrice: conversion.originalPrice || null,
                pricePrevious: conversion.originalPrice || null,
                discountPercent: conversion.priceDiscountRate || null,
              },
              template: currentData.settings?.defaultTemplate,
            });

            const cloneItemId = `clone-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const isAutoMode = config.mode === 'auto_automation';
            const targetAutoId = isAutoMode ? (config.targetAutomationId || null) : null;
            let createdProductId: string | null = null;

            // In Automatic mode: persist product into library and queue directly for automation
            if (isAutoMode) {
              const nowIso = new Date().toISOString();
              createdProductId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

              db.update((d) => {
                const existingProdIdx = d.products.findIndex(
                  (p) =>
                    (itemId && p.itemId && p.itemId === itemId && (!shopId || p.shopId === shopId)) ||
                    p.productLink === parsed.cleanUrl ||
                    p.affiliateLink === conversion.affiliateUrl
                );

                if (existingProdIdx >= 0) {
                  createdProductId = d.products[existingProdIdx].id;
                  d.products[existingProdIdx].affiliateLink = conversion.affiliateUrl;
                  d.products[existingProdIdx].updatedAt = nowIso;
                } else {
                  const newProduct: Product = {
                    id: createdProductId!,
                    itemId,
                    shopId,
                    productName: conversion.productName,
                    productLink: parsed.cleanUrl,
                    affiliateLink: conversion.affiliateUrl,
                    imageUrl: conversion.imageUrl,
                    priceMin: conversion.priceMin,
                    priceMax: conversion.priceMax,
                    currentPrice: conversion.priceMin,
                    originalPrice: conversion.originalPrice || null,
                    pricePrevious: conversion.originalPrice || null,
                    discountPercent: conversion.priceDiscountRate || null,
                    priceSource: 'clone_auto',
                    priceUpdatedAt: nowIso,
                    source: 'shopee',
                    createdBy: 'import_shopee',
                    originalUrl: parsed.original,
                    sales: conversion.sales,
                    shopName: conversion.shopName,
                    commissionRate: conversion.commissionRate,
                    commission: conversion.commission,
                    subIds: cleanSubIds.length > 0 ? cleanSubIds : null,
                    status: 'available',
                    createdAt: nowIso,
                    updatedAt: nowIso,
                  };
                  d.products.unshift(newProduct);
                }

                // If target automation specified, add to automation queue
                if (targetAutoId) {
                  const auto = d.automations.find((a) => a.id === targetAutoId);
                  if (auto) {
                    const existingQueueCount = d.automation_products.filter((ap) => ap.automationId === targetAutoId).length;
                    d.automation_products.push({
                      id: `ap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      automationId: targetAutoId,
                      productId: createdProductId!,
                      sortOrder: existingQueueCount,
                      status: 'pending',
                      createdAt: nowIso,
                    });
                  }
                }
              });
            }

            // Save CloneItem record
            const newCloneItem: CloneItem = {
              id: cloneItemId,
              sourceGroupJid,
              sourceGroupName: config.sourceGroupName || sourceGroupJid,
              sourceMessageId,
              sourceTimestamp,
              capturedUrl: rawUrl,
              canonicalUrl: parsed.cleanUrl,
              itemId,
              shopId,
              productName: conversion.productName,
              currentPrice: conversion.priceMin,
              originalPrice: conversion.originalPrice || null,
              imageUrl: conversion.imageUrl,
              generatedAffiliateUrl: conversion.affiliateUrl,
              formattedMessage,
              status: isAutoMode ? 'auto_added' : 'waiting_approval',
              productId: createdProductId,
              targetAutomationId: targetAutoId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            db.update((d) => {
              if (!d.clone_items) d.clone_items = [];
              d.clone_items.unshift(newCloneItem);
              d.activity_logs.unshift({
                id: `log-${Date.now()}`,
                type: 'clone',
                description: isAutoMode
                  ? `Clone Automático: Produto "${conversion.productName}" capturado e adicionado à automação.`
                  : `Clone: Produto "${conversion.productName}" capturado e aguardando aprovação.`,
                createdAt: new Date().toISOString(),
              });
            });

            capturedCount++;
            logMessages.push(`[Clone] Produto "${conversion.productName}" capturado com sucesso (${newCloneItem.status}).`);
          } catch (err: any) {
            errorCount++;
            console.error(`[Clone] Erro ao converter URL ${rawUrl}:`, err.message);
            this.recordErrorItem(sourceGroupJid, sourceMessageId, sourceTimestamp, rawUrl, err.message);
          }
        }
      }

      // Update last processed timestamp and message id in database
      db.update((d) => {
        if (d.clone_config) {
          d.clone_config.lastProcessedTimestamp = maxProcessedTimestamp;
          if (lastProcessedMsgId) {
            d.clone_config.lastProcessedMessageId = lastProcessedMsgId;
          }
          d.clone_config.updatedAt = new Date().toISOString();
        }
      });

      return {
        processed: incomingMessages.length,
        captured: capturedCount,
        ignored: ignoredCount,
        errors: errorCount,
        messages: logMessages,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  private static recordIgnoredItem(
    sourceGroupJid: string,
    sourceMessageId: string,
    sourceTimestamp: number,
    capturedUrl: string,
    ignoreReason: string
  ) {
    db.update((d) => {
      if (!d.clone_items) d.clone_items = [];
      d.clone_items.unshift({
        id: `ci-ign-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sourceGroupJid,
        sourceMessageId,
        sourceTimestamp,
        capturedUrl,
        status: 'ignored',
        ignoreReason,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  private static recordErrorItem(
    sourceGroupJid: string,
    sourceMessageId: string,
    sourceTimestamp: number,
    capturedUrl: string,
    errorMessage: string
  ) {
    db.update((d) => {
      if (!d.clone_items) d.clone_items = [];
      d.clone_items.unshift({
        id: `ci-err-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sourceGroupJid,
        sourceMessageId,
        sourceTimestamp,
        capturedUrl,
        status: 'error',
        error: errorMessage,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  /**
   * Approves a pending clone item, saving it to the library and optionally queueing it for an automation.
   */
  public static async approveItem(
    itemId: string,
    targetAutomationId?: string | null
  ): Promise<{ success: boolean; error?: string }> {
    const data = db.read();
    const item = (data.clone_items || []).find((ci) => ci.id === itemId);

    if (!item) {
      return { success: false, error: 'Item não encontrado na fila do Clone.' };
    }

    if (item.status !== 'waiting_approval') {
      return { success: false, error: `Item com status "${item.status}" não pode ser aprovado.` };
    }

    const nowIso = new Date().toISOString();
    let savedProductId = item.productId || `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    db.update((d) => {
      // 1. Add / update in products
      const existingIdx = d.products.findIndex(
        (p) =>
          (item.itemId && p.itemId && p.itemId === item.itemId) ||
          p.productLink === item.canonicalUrl ||
          p.affiliateLink === item.generatedAffiliateUrl
      );

      if (existingIdx >= 0) {
        savedProductId = d.products[existingIdx].id;
        d.products[existingIdx].status = 'available';
        d.products[existingIdx].updatedAt = nowIso;
      } else {
        const newProd: Product = {
          id: savedProductId,
          itemId: item.itemId,
          shopId: item.shopId,
          productName: item.productName || 'Produto Clonado',
          productLink: item.canonicalUrl || item.capturedUrl,
          affiliateLink: item.generatedAffiliateUrl || item.canonicalUrl || item.capturedUrl,
          imageUrl: item.imageUrl,
          priceMin: item.currentPrice || 0,
          currentPrice: item.currentPrice || 0,
          originalPrice: item.originalPrice || null,
          pricePrevious: item.originalPrice || null,
          priceSource: 'clone_approved',
          priceUpdatedAt: nowIso,
          source: 'shopee',
          createdBy: 'import_shopee',
          originalUrl: item.capturedUrl,
          subIds: d.clone_config?.subIds || null,
          status: 'available',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        d.products.unshift(newProd);
      }

      // 2. If targetAutomationId is provided, add to automation queue
      if (targetAutomationId) {
        const auto = d.automations.find((a) => a.id === targetAutomationId);
        if (auto) {
          const queueCount = d.automation_products.filter((ap) => ap.automationId === targetAutomationId).length;
          d.automation_products.push({
            id: `ap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            automationId: targetAutomationId,
            productId: savedProductId,
            sortOrder: queueCount,
            status: 'pending',
            createdAt: nowIso,
          });
        }
      }

      // 3. Update clone item status
      const cloneItemInDb = (d.clone_items || []).find((ci) => ci.id === itemId);
      if (cloneItemInDb) {
        cloneItemInDb.status = 'approved';
        cloneItemInDb.productId = savedProductId;
        cloneItemInDb.targetAutomationId = targetAutomationId || null;
        cloneItemInDb.updatedAt = nowIso;
      }

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'clone',
        description: `Item clonado "${item.productName || item.capturedUrl}" foi aprovado pelo usuário.`,
        createdAt: nowIso,
      });
    });

    return { success: true };
  }

  /**
   * Rejects a pending clone item.
   */
  public static async rejectItem(itemId: string): Promise<{ success: boolean; error?: string }> {
    const data = db.read();
    const item = (data.clone_items || []).find((ci) => ci.id === itemId);

    if (!item) {
      return { success: false, error: 'Item não encontrado na fila do Clone.' };
    }

    db.update((d) => {
      const ci = (d.clone_items || []).find((c) => c.id === itemId);
      if (ci) {
        ci.status = 'rejected';
        ci.updatedAt = new Date().toISOString();
      }
    });

    return { success: true };
  }
}

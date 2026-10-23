import { Env, AutomationRow, ProductRow } from '../types';
import { DatabaseService } from './db';
import { WorkerEvolutionClient } from './evolution';
import { WorkerShopeeClient, parseShopeeUrl } from './shopee';

export function formatWhatsAppMessage(product: ProductRow, template: string): string {
  const currentPriceFormatted = product.price_min
    ? product.price_min.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const previousPriceFormatted =
    product.price_previous && product.price_previous > product.price_min
      ? product.price_previous.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';

  const couponCode = product.coupon_code && product.coupon_code.trim() ? product.coupon_code.trim() : '';
  const link = product.affiliate_link || product.product_link;
  const ratingStars = product.rating_star ? '⭐'.repeat(Math.min(5, Math.max(1, Math.round(product.rating_star)))) : '⭐⭐⭐⭐⭐';

  const discountFormatted = product.price_discount_rate
    ? `${product.price_discount_rate}% OFF`
    : (product.price_previous && product.price_previous > product.price_min
      ? `${Math.round(((product.price_previous - product.price_min) / product.price_previous) * 100)}% OFF`
      : '');

  const commissionFormatted = product.commission
    ? `R$ ${product.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : (product.commission_rate ? `${product.commission_rate}%` : '');

  const lines = template.split('\n');
  const processedLines: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine;

    // Previous price conditional
    if (line.includes('{{preco_anterior}}') || line.toLowerCase().includes('de r$')) {
      if (!previousPriceFormatted) continue; // Suppress line completely
    }

    // Coupon conditional
    if (line.includes('{{cupom}}') || line.toLowerCase().includes('cupom:')) {
      if (!couponCode) continue; // Suppress line completely
    }

    if (line.includes('{{desconto}}') && !discountFormatted) continue;
    if (line.includes('{{comissao}}') && !commissionFormatted) continue;

    line = line
      .replace(/\{\{nome\}\}/g, product.product_name || '')
      .replace(/\{\{preco_atual\}\}/g, currentPriceFormatted)
      .replace(/\{\{preco_anterior\}\}/g, previousPriceFormatted)
      .replace(/\{\{cupom\}\}/g, couponCode)
      .replace(/\{\{link\}\}/g, link)
      .replace(/\{\{avaliacao\}\}/g, ratingStars)
      .replace(/\{\{desconto\}\}/g, discountFormatted)
      .replace(/\{\{comissao\}\}/g, commissionFormatted);

    processedLines.push(line);
  }

  return processedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export class WorkerScheduler {
  private env: Env;
  private db: DatabaseService;
  private evolution: WorkerEvolutionClient;
  private shopee: WorkerShopeeClient;

  constructor(env: Env) {
    this.env = env;
    this.db = new DatabaseService(env.DB);
    this.evolution = new WorkerEvolutionClient(env);
    this.shopee = new WorkerShopeeClient(env);
  }

  public isWithinTimeWindow(startTime: string, endTime: string, timezone: string = 'America/Bahia'): boolean {
    if (!startTime || !endTime) return true;
    try {
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const current = formatter.format(new Date());
      return current >= startTime && current <= endTime;
    } catch {
      return true;
    }
  }

  public async tick(): Promise<{ processedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let processedCount = 0;

    // Fetch active automations overdue
    const { results: activeAutomations } = await this.env.DB
      .prepare(
        `SELECT * FROM automations
         WHERE status = 'active'
         AND (next_run_at IS NULL OR next_run_at <= CURRENT_TIMESTAMP)`
      )
      .all<AutomationRow>();

    for (const automation of activeAutomations || []) {
      try {
        if (!this.isWithinTimeWindow(automation.start_time, automation.end_time, automation.timezone)) {
          continue;
        }

        const dispatched = await this.dispatchNextProduct(automation);
        if (dispatched) processedCount++;
      } catch (err: any) {
        errors.push(`Automação ${automation.name}: ${err.message}`);
      }
    }

    return { processedCount, errors };
  }

  public async dispatchNextProduct(automation: AutomationRow): Promise<boolean> {
    // 1. Get associated WhatsApp groups
    const { results: memberRows } = await this.env.DB
      .prepare('SELECT provider_group_id FROM configuration_group_members WHERE configuration_group_id = ?')
      .bind(automation.configuration_group_id)
      .all<{ provider_group_id: string }>();

    const targetGroupJids = (memberRows || []).map((m) => m.provider_group_id);
    if (targetGroupJids.length === 0) return false;

    // 2. Get ordered products in queue
    const { results: queueItems } = await this.env.DB
      .prepare('SELECT * FROM automation_products WHERE automation_id = ? ORDER BY sort_order ASC')
      .bind(automation.id)
      .all<{ id: string; product_id: string; sort_order: number; status: string }>();

    const items = queueItems || [];
    if (items.length === 0) return false;

    const currentIndex = automation.current_product_index || 0;

    // End of queue check
    if (currentIndex >= items.length) {
      if (automation.on_complete === 'stop') {
        await this.env.DB
          .prepare('UPDATE automations SET status = "completed", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(automation.id)
          .run();
        return false;
      } else {
        // Restart from beginning in a new cycle
        await this.env.DB
          .prepare('UPDATE automations SET current_product_index = 0, current_cycle = current_cycle + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(automation.id)
          .run();

        const updated = await this.env.DB
          .prepare('SELECT * FROM automations WHERE id = ?')
          .bind(automation.id)
          .first<AutomationRow>();
        if (updated) return this.dispatchNextProduct(updated);
        return false;
      }
    }

    const currentQueueItem = items[currentIndex];
    const product = await this.env.DB
      .prepare('SELECT * FROM products WHERE id = ?')
      .bind(currentQueueItem.product_id)
      .first<ProductRow>();

    if (!product) {
      // Advance past missing product
      await this.advanceQueue(automation.id, currentIndex, automation.interval_minutes);
      return false;
    }

    // Mark as preparing
    await this.env.DB
      .prepare('UPDATE automation_products SET status = "preparing" WHERE id = ?')
      .bind(currentQueueItem.id)
      .run();

    // Re-verify affiliate link if needed
    let finalAffiliateLink = product.affiliate_link;
    if (!finalAffiliateLink && product.product_link) {
      try {
        const parsed = parseShopeeUrl(product.product_link);
        if (parsed) {
          const subIds = product.sub_ids ? JSON.parse(product.sub_ids) : [];
          finalAffiliateLink = await this.shopee.generateShortLink(parsed.cleanUrl, subIds);
          await this.env.DB
            .prepare('UPDATE products SET affiliate_link = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(finalAffiliateLink, product.id)
            .run();
        }
      } catch (e) {
        console.warn('Shopee link refresh warning:', e);
      }
    }

    const messageContent = formatWhatsAppMessage(
      { ...product, affiliate_link: finalAffiliateLink || product.product_link },
      automation.message_template
    );

    const cycleId = automation.current_cycle || 1;
    let anySuccess = false;
    let hadOfflineError = false;

    // Send to each group individually
    for (const groupJid of targetGroupJids) {
      const idempotentKey = `${automation.id}:${cycleId}:${product.id}:${groupJid}`;

      // Idempotency: skip if already sent in this cycle to this group
      const existing = await this.env.DB
        .prepare('SELECT id FROM message_jobs WHERE idempotent_key = ? AND status = "sent"')
        .bind(idempotentKey)
        .first();

      if (existing) continue;

      const groupRow = await this.env.DB
        .prepare('SELECT name FROM whatsapp_groups WHERE provider_group_id = ?')
        .bind(groupJid)
        .first<{ name: string }>();
      const groupName = groupRow?.name || groupJid;

      const targetLink = finalAffiliateLink || product.product_link;
      const sendResult = await this.evolution.sendLinkWithPreview(groupJid, targetLink, messageContent);

      if (sendResult.isOffline) {
        hadOfflineError = true;
      }

      const status = sendResult.success ? 'sent' : (sendResult.isOffline ? 'offline_retry' : 'error');
      if (sendResult.success) anySuccess = true;

      // Record job
      await this.env.DB
        .prepare(
          `INSERT INTO message_jobs (
            id, automation_id, cycle_id, product_id, product_name, provider_group_id,
            group_name, idempotent_key, status, link_used, sub_id_used, message_content,
            scheduled_for, request_started_at, response_received_at, provider_message_id,
            sent_at, error, attempts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 1)`
        )
        .bind(
          `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          automation.id,
          cycleId,
          product.id,
          product.product_name,
          groupJid,
          groupName,
          idempotentKey,
          status,
          targetLink,
          product.sub_ids,
          messageContent,
          sendResult.request_started_at,
          sendResult.response_received_at,
          sendResult.provider_message_id || null,
          sendResult.success ? new Date().toISOString() : null,
          sendResult.error || null
        )
        .run();
    }

    // REQUIREMENT 12: Comportamento quando o PC/OpenWA estiver offline
    // Se houve erro de offline, NÃO perde o produto, NÃO descarta da fila.
    // Reagenda uma nova tentativa em 2 minutos para checar se o PC voltou online.
    if (hadOfflineError && !anySuccess) {
      await this.env.DB
        .prepare(
          `UPDATE automations SET
            next_run_at = datetime("now", "+2 minutes"),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(automation.id)
        .run();

      await this.env.DB
        .prepare('UPDATE automation_products SET status = "waiting" WHERE id = ?')
        .bind(currentQueueItem.id)
        .run();

      return false;
    }

    // Advance queue to next product
    await this.env.DB
      .prepare('UPDATE automation_products SET status = ? WHERE id = ?')
      .bind(anySuccess ? 'sent' : 'error', currentQueueItem.id)
      .run();

    await this.env.DB
      .prepare('UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(anySuccess ? 'posted' : 'error', product.id)
      .run();

    await this.advanceQueue(automation.id, currentIndex, automation.interval_minutes);
    return true;
  }

  private async advanceQueue(automationId: string, currentIndex: number, intervalMinutes: number = 15): Promise<void> {
    await this.env.DB
      .prepare(
        `UPDATE automations SET
          current_product_index = ?,
          last_run_at = CURRENT_TIMESTAMP,
          next_run_at = datetime("now", "+${intervalMinutes} minutes"),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
      )
      .bind(currentIndex + 1, automationId)
      .run();
  }
}

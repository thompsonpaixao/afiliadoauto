import { db, Automation, MessageJob } from './db';
import { getWhatsAppProvider } from './whatsapp';
import { formatWhatsAppMessage } from './message-formatter';
import { ShopeeAffiliateClient, parseShopeeUrl } from './shopee';

export class SchedulerService {
  private static isProcessing = false;
  private static activeAutomationLocks = new Set<string>();

  public static isAutomationLocked(automationId: string): boolean {
    return this.activeAutomationLocks.has(automationId);
  }

  /**
   * Main scheduler tick.
   * Can be triggered by background intervals or Cloudflare Cron triggers (/api/cron/tick).
   */
  public static async tick(): Promise<{ processedCount: number; errors: string[] }> {
    if (this.isProcessing) {
      return { processedCount: 0, errors: ['Scheduler já está executando outro ciclo de processamento.'] };
    }

    this.isProcessing = true;
    const errors: string[] = [];
    let processedCount = 0;

    try {
      const data = db.read();
      const activeAutomations = data.automations.filter((a) => a.status === 'active');
      const now = new Date();

      for (const automation of activeAutomations) {
        try {
          // Check time window (startTime and endTime in local timezone)
          if (!this.isWithinTimeWindow(automation.startTime, automation.endTime, automation.timezone)) {
            continue;
          }

          // Check interval
          if (automation.nextRunAt) {
            const nextRun = new Date(automation.nextRunAt);
            if (now < nextRun) {
              continue; // Not yet time to dispatch
            }
          }

          // Process the next dispatch for this automation based on its type
          const dispatched = await this.dispatchAutomation(automation);
          if (dispatched) {
            processedCount++;
          }
        } catch (autoErr: any) {
          console.error(`Erro ao processar automação ${automation.id}:`, autoErr.message);
          errors.push(`Automação ${automation.name}: ${autoErr.message}`);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processedCount, errors };
  }

  /**
   * Validates if current time is within configured startTime and endTime (e.g. 08:00 - 22:00)
   * and within allowed days of week in the target timezone.
   */
  public static isWithinTimeWindow(
    startTime: string,
    endTime: string,
    timezone: string = 'America/Bahia',
    daysOfWeek?: number[]
  ): boolean {
    if (!startTime || !endTime) return true;

    try {
      if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
        const now = new Date();
        const tzDateStr = now.toLocaleString('en-US', { timeZone: timezone });
        const tzDate = new Date(tzDateStr);
        const currentDay = tzDate.getDay(); // 0 = Sunday, 6 = Saturday
        if (!daysOfWeek.includes(currentDay)) {
          return false;
        }
      }

      // Format current time in the target timezone
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const currentTimeString = formatter.format(new Date()); // e.g. "14:30"
      return currentTimeString >= startTime && currentTimeString <= endTime;
    } catch {
      return true; // Fallback to allow execution
    }
  }

  /**
   * Accurately calculates the next execution time adhering to time windows (startTime to endTime),
   * timezone, and days of the week.
   */
  public static calculateNextRunTime(
    intervalMinutes: number = 15,
    startTime: string = '08:00',
    endTime: string = '22:00',
    timezone: string = 'America/Bahia',
    daysOfWeek?: number[],
    fromDate: Date = new Date()
  ): string {
    const safeInterval = Math.max(1, intervalMinutes);
    let candidate = new Date(fromDate.getTime() + safeInterval * 60 * 1000);

    const getParts = (d: Date) => {
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = formatter.formatToParts(d);
      const hour = parts.find((p) => p.type === 'hour')?.value || '00';
      const minute = parts.find((p) => p.type === 'minute')?.value || '00';
      const year = parts.find((p) => p.type === 'year')?.value || '2026';
      const month = parts.find((p) => p.type === 'month')?.value || '01';
      const day = parts.find((p) => p.type === 'day')?.value || '01';
      return {
        timeStr: `${hour}:${minute}`,
        hour: parseInt(hour, 10),
        minute: parseInt(minute, 10),
        dayOfWeek: d.getDay(),
        dateStr: `${year}-${month}-${day}`,
      };
    };

    // If outside the window [startTime, endTime], adjust to the next opening of the window
    for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
      const checkDate = new Date(candidate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const info = getParts(checkDate);

      // Check day of week
      if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0 && !daysOfWeek.includes(info.dayOfWeek)) {
        continue;
      }

      // If checking on same day candidate:
      if (dayOffset === 0) {
        if (info.timeStr >= startTime && info.timeStr <= endTime) {
          return candidate.toISOString();
        }
        if (info.timeStr < startTime) {
          // Candidate is earlier than startTime today: set to startTime today
          const [sH, sM] = startTime.split(':').map((v) => parseInt(v, 10));
          const diffMinutes = (sH * 60 + sM) - (info.hour * 60 + info.minute);
          return new Date(candidate.getTime() + diffMinutes * 60 * 1000).toISOString();
        }
        // If info.timeStr > endTime today: advance to next day at startTime
        continue;
      }

      // Next day(s): set exactly to startTime
      const [sH, sM] = startTime.split(':').map((v) => parseInt(v, 10));
      const nextDayCandidate = new Date(checkDate.getTime());
      const diffMinutes = (sH * 60 + sM) - (info.hour * 60 + info.minute);
      return new Date(nextDayCandidate.getTime() + diffMinutes * 60 * 1000).toISOString();
    }

    return candidate.toISOString();
  }

  /**
   * Router for dispatching any automation by its type
   */
  public static async dispatchAutomation(automation: Automation): Promise<boolean> {
    if (this.activeAutomationLocks.has(automation.id)) {
      console.log(`[Scheduler] Automação ${automation.id} já possui um envio em andamento. Ignorando chamada concorrente.`);
      return false;
    }

    this.activeAutomationLocks.add(automation.id);
    try {
      const type = automation.type || 'product';
      if (type === 'message' || type === 'recurring_message') {
        return await this.dispatchTextMessage(automation);
      }
      return await this.dispatchNextProduct(automation);
    } finally {
      this.activeAutomationLocks.delete(automation.id);
    }
  }

  /**
   * Dispatches freeform text message (avulsa ou recorrente) to target groups
   */
  public static async dispatchTextMessage(automation: Automation): Promise<boolean> {
    const data = db.read();

    // 1. Determine target WhatsApp groups
    let targetGroupJids: string[] = [];
    if (automation.targetGroups && automation.targetGroups.length > 0) {
      targetGroupJids = automation.targetGroups;
    } else if (automation.configurationGroupId) {
      const configGroup = data.configuration_groups.find((cg) => cg.id === automation.configurationGroupId);
      if (configGroup) {
        targetGroupJids = configGroup.groupJids;
      }
    }

    if (!targetGroupJids || targetGroupJids.length === 0) {
      console.warn(`Automação ${automation.id} (${automation.name}) não possui grupos de WhatsApp.`);
      return false;
    }

    const textContent = (automation.content || '').trim();
    if (!textContent && !automation.linkUrl) {
      console.warn(`Automação ${automation.id} não possui texto ou link configurado.`);
      return false;
    }

    const now = new Date();
    const cycleId = automation.currentCycle || 1;
    const whatsapp = getWhatsAppProvider();
    const groupDelaySeconds = Math.min(30, Math.max(0, automation.groupDelaySeconds ?? 2));
    const delayMs = groupDelaySeconds * 1000;

    let anySuccess = false;

    for (let gIdx = 0; gIdx < targetGroupJids.length; gIdx++) {
      const groupJid = targetGroupJids[gIdx];

      if (gIdx > 0 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const groupInfo = data.whatsapp_groups.find(
        (g) => (g.provider_group_id || g.groupJid) === groupJid
      );
      const groupName = groupInfo?.name || groupJid;
      const idempotentKey = `${automation.id}:${cycleId}:msg:${groupJid}`;
      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      let shouldSkip = false;

      // 1. Atomic claim check
      db.update((d) => {
        const existingJob = d.message_jobs.find(
          (j) => j.idempotentKey === idempotentKey && (j.status === 'sent' || j.status === 'processing')
        );
        if (existingJob) {
          shouldSkip = true;
          return;
        }

        d.message_jobs.unshift({
          id: jobId,
          automationId: automation.id,
          cycleId,
          productId: null,
          productName: automation.name,
          whatsappGroupJid: groupJid,
          provider_group_id: groupJid,
          groupName,
          idempotentKey,
          status: 'processing',
          linkUsed: automation.linkUrl || '',
          subIdUsed: null,
          messageContent: automation.linkUrl ? `${textContent}\n\n${automation.linkUrl}` : textContent,
          scheduledFor: now.toISOString(),
          sentAt: null,
          request_started_at: new Date().toISOString(),
          response_received_at: null,
          provider_message_id: null,
          error: null,
          attempts: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      });

      if (shouldSkip) {
        console.log(`[Scheduler] Skipping duplicate text dispatch for ${idempotentKey} (already processing or sent)`);
        continue;
      }

      try {
        let sendResult;
        if (automation.linkUrl) {
          sendResult = await whatsapp.sendLinkWithPreview(groupJid, automation.linkUrl, textContent);
        } else {
          sendResult = await whatsapp.sendText(groupJid, textContent);
        }

        const finalStatus: 'sent' | 'failed' = sendResult.success ? 'sent' : 'failed';
        if (sendResult.success) anySuccess = true;

        db.update((d) => {
          const job = d.message_jobs.find((j) => j.id === jobId);
          if (job) {
            job.status = finalStatus;
            job.sentAt = sendResult.success ? new Date().toISOString() : null;
            job.request_started_at = sendResult.request_started_at || job.request_started_at;
            job.response_received_at = sendResult.response_received_at || new Date().toISOString();
            job.provider_message_id = sendResult.provider_message_id || null;
            job.error = sendResult.error || null;
            job.updatedAt = new Date().toISOString();
          }
        });
      } catch (err: any) {
        console.error(`Erro ao disparar mensagem para ${groupJid}:`, err.message);
        db.update((d) => {
          const job = d.message_jobs.find((j) => j.id === jobId);
          if (job) {
            job.status = 'failed';
            job.error = err.message;
            job.response_received_at = new Date().toISOString();
            job.updatedAt = new Date().toISOString();
          }
        });
      }
    }

    // Update automation status / cycle / nextRunAt
    db.update((d) => {
      const auto = d.automations.find((a) => a.id === automation.id);
      if (auto) {
        auto.lastRunAt = now.toISOString();
        auto.currentCycle = cycleId + 1;

        if (auto.type === 'message') {
          // Single message: mark completed
          auto.status = 'completed';
          auto.nextRunAt = null;
        } else {
          // Recurring message: calculate next run time with time window adherence
          auto.nextRunAt = SchedulerService.calculateNextRunTime(
            auto.intervalMinutes || 15,
            auto.startTime || '08:00',
            auto.endTime || '22:00',
            auto.timezone || 'America/Bahia',
            auto.daysOfWeek,
            now
          );
        }
        auto.updatedAt = now.toISOString();
      }

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'dispatch',
        description: `Disparo da automação "${automation.name}" (${automation.type || 'mensagem'}) para ${targetGroupJids.length} grupo(s).`,
        createdAt: now.toISOString(),
      });
    });

    return anySuccess;
  }

  /**
   * Dispatches the next product in line for an active automation
   */
  public static async dispatchNextProduct(automation: Automation): Promise<boolean> {
    const data = db.read();

    // 1. Get associated WhatsApp groups
    let targetGroupJids: string[] = [];
    if (automation.targetGroups && automation.targetGroups.length > 0) {
      targetGroupJids = automation.targetGroups;
    } else if (automation.configurationGroupId) {
      const configGroup = data.configuration_groups.find((cg) => cg.id === automation.configurationGroupId);
      if (configGroup) {
        targetGroupJids = configGroup.groupJids;
      }
    }

    if (!targetGroupJids || targetGroupJids.length === 0) {
      console.warn(`Automação ${automation.id} não possui grupos de WhatsApp associados.`);
      return false;
    }

    // 2. Get ordered products for this automation
    const queueProducts = data.automation_products
      .filter((ap) => ap.automationId === automation.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (queueProducts.length === 0) {
      console.warn(`Automação ${automation.id} não possui produtos na fila.`);
      return false;
    }

    const currentIndex = automation.currentProductIndex || 0;

    // Check if queue has ended
    if (currentIndex >= queueProducts.length) {
      if (automation.onComplete === 'stop') {
        db.update((d) => {
          const auto = d.automations.find((a) => a.id === automation.id);
          if (auto) {
            auto.status = 'completed';
            auto.nextRunAt = null;
            auto.completedAt = auto.completedAt || new Date().toISOString();
            auto.updatedAt = new Date().toISOString();
          }
        });
        return false;
      } else {
        // Restart from beginning as a new cycle
        db.update((d) => {
          const auto = d.automations.find((a) => a.id === automation.id);
          if (auto) {
            auto.currentProductIndex = 0;
            auto.currentCycle = (auto.currentCycle || 1) + 1;
            auto.nextRunAt = SchedulerService.calculateNextRunTime(
              auto.intervalMinutes || 10,
              auto.startTime || '08:00',
              auto.endTime || '22:00',
              auto.timezone || 'America/Bahia',
              auto.daysOfWeek,
              new Date()
            );
            auto.updatedAt = new Date().toISOString();
          }
          
          const qItems = d.automation_products.filter((ap) => ap.automationId === automation.id);
          if (auto?.productOrder === 'random') {
            // Fisher-Yates re-shuffle for the new cycle
            for (let i = qItems.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              const temp = qItems[i];
              qItems[i] = qItems[j];
              qItems[j] = temp;
            }
            qItems.forEach((ap, idx) => {
              ap.sortOrder = idx;
              ap.status = 'pending';
            });
          } else {
            // Reset queue items back to pending for next cycle keeping existing sequential sortOrder
            qItems.forEach((ap) => {
              ap.status = 'pending';
            });
          }
        });
        // Reread and dispatch first item
        const updatedAuto = db.read().automations.find((a) => a.id === automation.id);
        if (updatedAuto) return this.dispatchNextProduct(updatedAuto);
        return false;
      }
    }

    const targetQueueItem = queueProducts[currentIndex];
    const targetProduct = data.products.find((p) => p.id === targetQueueItem.productId);

    if (!targetProduct) {
      console.warn(`Produto ${targetQueueItem.productId} não encontrado na biblioteca.`);
      // Advance to next index
      this.advanceQueue(
        automation.id,
        currentIndex,
        automation.intervalMinutes,
        queueProducts.length,
        automation.onComplete || 'stop'
      );
      return false;
    }

    // Mark status as processing
    db.update((d) => {
      const qItem = d.automation_products.find((ap) => ap.id === targetQueueItem.id);
      if (qItem) qItem.status = 'processing';
    });

    const now = new Date();
    const cycleId = automation.currentCycle || 1;
    const whatsapp = getWhatsAppProvider();
    const shopee = new ShopeeAffiliateClient();

    // Re-verify affiliate link if needed
    let finalAffiliateLink = targetProduct.affiliateLink;
    if (!finalAffiliateLink && targetProduct.productLink) {
      try {
        const parsed = parseShopeeUrl(targetProduct.productLink);
        if (parsed && shopee.isConfigured()) {
          finalAffiliateLink = await shopee.generateShortLink(parsed.cleanUrl, targetProduct.subIds || []);
          db.update((d) => {
            const p = d.products.find((prod) => prod.id === targetProduct.id);
            if (p) p.affiliateLink = finalAffiliateLink;
          });
        }
      } catch (e: any) {
        console.warn('Não foi possível gerar novo link afiliado antes do disparo:', e.message);
      }
    }

    // Format final message
    const messageContent = formatWhatsAppMessage({
      product: { ...targetProduct, affiliateLink: finalAffiliateLink || targetProduct.productLink },
      template: automation.messageTemplate,
    });

    const groupDelaySeconds = Math.min(30, Math.max(0, automation.groupDelaySeconds ?? 2));
    const delayMs = groupDelaySeconds * 1000;

    let anySuccess = false;
    let successCount = 0;

    // Send to each target group individually with configured delay
    for (let gIdx = 0; gIdx < targetGroupJids.length; gIdx++) {
      const groupJid = targetGroupJids[gIdx];

      // Delay between groups in the same round (0-30s, default 2s)
      if (gIdx > 0 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const idempotentKey = `${automation.id}:${cycleId}:${targetProduct.id}:${groupJid}`;
      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const targetLink = finalAffiliateLink || targetProduct.productLink;

      // Group display name
      const groupInfo = data.whatsapp_groups.find(
        (g) => (g.provider_group_id || g.groupJid) === groupJid
      );
      const groupName = groupInfo?.name || groupJid;

      // 1. Atomic claim check: ensure no concurrent scheduler or manual dispatch sends this item
      let shouldSkip = false;
      db.update((d) => {
        const existingJob = d.message_jobs.find(
          (j) => j.idempotentKey === idempotentKey && (j.status === 'sent' || j.status === 'processing')
        );

        if (existingJob) {
          shouldSkip = true;
          return;
        }

        // Insert atomic in-flight claim
        d.message_jobs.unshift({
          id: jobId,
          automationId: automation.id,
          cycleId,
          productId: targetProduct.id,
          productName: targetProduct.productName,
          whatsappGroupJid: groupJid,
          provider_group_id: groupJid,
          groupName,
          idempotentKey,
          status: 'processing',
          linkUsed: targetLink,
          subIdUsed: targetProduct.subIds?.join(', ') || null,
          messageContent,
          scheduledFor: now.toISOString(),
          sentAt: null,
          request_started_at: new Date().toISOString(),
          response_received_at: null,
          provider_message_id: null,
          error: null,
          attempts: 1,
          createdAt: now.toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      if (shouldSkip) {
        console.log(`[Scheduler] Skipping duplicate product dispatch for ${idempotentKey} (already processing or sent)`);
        continue;
      }

      try {
        let sendResult;

        // If product has an image, send media with caption (exactly 1 message per product/group)
        if (targetProduct.imageUrl && targetProduct.imageUrl.startsWith('http') && whatsapp.sendMedia) {
          sendResult = await whatsapp.sendMedia(
            groupJid,
            targetProduct.imageUrl,
            messageContent
          );
        } else {
          sendResult = await whatsapp.sendLinkWithPreview(
            groupJid,
            targetLink,
            messageContent
          );
        }

        const status: 'sent' | 'failed' = sendResult.success ? 'sent' : 'failed';
        const errorMsg = sendResult.error || null;
        if (sendResult.success) {
          anySuccess = true;
          successCount++;
        }

        // Finalize claimed message job with provider timestamps and message ID
        db.update((d) => {
          const job = d.message_jobs.find((j) => j.id === jobId);
          if (job) {
            job.status = status;
            job.sentAt = sendResult.success ? new Date().toISOString() : null;
            job.request_started_at = sendResult.request_started_at || job.request_started_at;
            job.response_received_at = sendResult.response_received_at || new Date().toISOString();
            job.provider_message_id = sendResult.provider_message_id || null;
            job.error = errorMsg;
            job.updatedAt = new Date().toISOString();
          }

          // Add to activity logs
          d.activity_logs.unshift({
            id: `log-${Date.now()}`,
            type: 'dispatch',
            description: sendResult.success
              ? `Produto "${targetProduct.productName}" enviado para o grupo "${groupName}".`
              : `Falha ao enviar "${targetProduct.productName}" para "${groupName}": ${errorMsg}`,
            metadata: {
              automationId: automation.id,
              groupJid,
              providerMessageId: sendResult.provider_message_id,
              status,
              error: errorMsg,
            },
            createdAt: new Date().toISOString(),
          });
        });
      } catch (grpErr: any) {
        console.error(`Falha no grupo ${groupJid}:`, grpErr.message);
        db.update((d) => {
          const job = d.message_jobs.find((j) => j.id === jobId);
          if (job) {
            job.status = 'failed';
            job.error = grpErr.message;
            job.response_received_at = new Date().toISOString();
            job.updatedAt = new Date().toISOString();
          }
        });
      }
    }

    // Update product and queue item status
    db.update((d) => {
      const qItem = d.automation_products.find((ap) => ap.id === targetQueueItem.id);
      if (qItem) {
        if (successCount === targetGroupJids.length) {
          qItem.status = 'sent';
        } else if (successCount > 0) {
          qItem.status = 'partial';
        } else {
          qItem.status = 'failed';
        }
      }

      const prod = d.products.find((p) => p.id === targetProduct.id);
      if (prod) {
        prod.status = anySuccess ? 'posted' : 'error';
        prod.updatedAt = new Date().toISOString();
      }
    });

    // Advance queue to next product or complete automation immediately
    this.advanceQueue(
      automation.id,
      currentIndex,
      automation.intervalMinutes,
      queueProducts.length,
      automation.onComplete || 'stop'
    );

    return true;
  }

  /**
   * Advances the queue pointer or completes the automation if end of cycle reached
   */
  private static advanceQueue(
    automationId: string,
    currentIndex: number,
    intervalMinutes: number = 10,
    totalQueueLength: number = 1,
    onComplete: 'stop' | 'restart' = 'stop'
  ) {
    const nextIndex = currentIndex + 1;
    const now = new Date().toISOString();

    db.update((d) => {
      const auto = d.automations.find((a) => a.id === automationId);
      if (auto) {
        auto.lastRunAt = now;
        auto.updatedAt = now;

        if (nextIndex >= totalQueueLength) {
          if (onComplete === 'stop') {
            auto.currentProductIndex = nextIndex;
            auto.status = 'completed';
            auto.nextRunAt = null;
            auto.completedAt = now;
          } else {
            // Restart cycle from beginning
            auto.currentProductIndex = 0;
            auto.currentCycle = (auto.currentCycle || 1) + 1;
            auto.nextRunAt = SchedulerService.calculateNextRunTime(
              intervalMinutes,
              auto.startTime || '08:00',
              auto.endTime || '22:00',
              auto.timezone || 'America/Bahia',
              auto.daysOfWeek
            );

            const qItems = d.automation_products.filter((ap) => ap.automationId === automationId);
            if (auto.productOrder === 'random') {
              // Re-shuffle for the new cycle
              for (let i = qItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = qItems[i];
                qItems[i] = qItems[j];
                qItems[j] = temp;
              }
              qItems.forEach((ap, idx) => {
                ap.sortOrder = idx;
                ap.status = 'pending';
              });
            } else {
              // Reset queue items back to pending keeping existing sequential order
              qItems.forEach((ap) => {
                ap.status = 'pending';
              });
            }
          }
        } else {
          auto.currentProductIndex = nextIndex;
          auto.nextRunAt = SchedulerService.calculateNextRunTime(
            intervalMinutes,
            auto.startTime || '08:00',
            auto.endTime || '22:00',
            auto.timezone || 'America/Bahia',
            auto.daysOfWeek
          );
        }
      }
    });
  }

  /**
   * Retries sending a failed job
   */
  public static async retryJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    const data = db.read();
    const job = data.message_jobs.find((j) => j.id === jobId);
    if (!job) return { success: false, error: 'Disparo não encontrado' };

    const { getWhatsAppProvider } = await import('./whatsapp');
    const whatsapp = getWhatsAppProvider();

    try {
      let result;
      if (job.linkUsed) {
        result = await whatsapp.sendLinkWithPreview(job.whatsappGroupJid, job.linkUsed, job.messageContent);
      } else {
        result = await whatsapp.sendText(job.whatsappGroupJid, job.messageContent);
      }

      db.update((d) => {
        const currentJob = d.message_jobs.find((j) => j.id === jobId);
        if (currentJob) {
          currentJob.attempts += 1;
          currentJob.status = result.success ? 'sent' : 'failed';
          currentJob.sentAt = result.success ? new Date().toISOString() : null;
          currentJob.request_started_at = result.request_started_at;
          currentJob.response_received_at = result.response_received_at;
          currentJob.provider_message_id = result.provider_message_id || null;
          currentJob.error = result.error || null;
          currentJob.updatedAt = new Date().toISOString();
        }
      });

      return {
        success: result.success,
        error: result.error || undefined,
      };
    } catch (e: any) {
      db.update((d) => {
        const currentJob = d.message_jobs.find((j) => j.id === jobId);
        if (currentJob) {
          currentJob.attempts += 1;
          currentJob.status = 'failed';
          currentJob.error = e.message;
          currentJob.updatedAt = new Date().toISOString();
        }
      });
      return { success: false, error: e.message };
    }
  }
}

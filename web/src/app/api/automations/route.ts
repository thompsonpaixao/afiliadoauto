import { NextRequest, NextResponse } from 'next/server';
import { db, Automation, AutomationProduct } from '@/lib/db';
import { DEFAULT_MESSAGE_TEMPLATE } from '@/lib/message-formatter';
import { SchedulerService } from '@/lib/scheduler';

export async function GET() {
  try {
    const data = db.read();
    const automations = data.automations.map((a) => {
      const type = a.type || 'product';
      const configGroup = a.configurationGroupId
        ? data.configuration_groups.find((cg) => cg.id === a.configurationGroupId)
        : null;

      const groupName = configGroup?.name || (a.targetGroups && a.targetGroups.length > 0 ? `${a.targetGroups.length} grupo(s) selecionado(s)` : 'Nenhum grupo');
      const groupCount = configGroup?.groupJids?.length || a.targetGroups?.length || 0;

      const queue = data.automation_products
        .filter((ap) => ap.automationId === a.id)
        .sort((p1, p2) => p1.sortOrder - p2.sortOrder);

      const totalProducts = queue.length;
      const currentIndex = a.currentProductIndex || 0;
      const sentCount = a.status === 'completed'
        ? totalProducts
        : queue.filter((ap) => ap.status === 'sent' || ap.status === 'partial').length;

      const waitingCount = a.status === 'completed'
        ? 0
        : queue.filter((ap) => ap.status === 'pending' || ap.status === 'processing').length;

      const errorCount = queue.filter((ap) => ap.status === 'failed').length;

      const progressPercent = totalProducts > 0
        ? (a.status === 'completed' ? 100 : Math.min(100, Math.round((sentCount / totalProducts) * 100)))
        : (a.status === 'completed' ? 100 : 0);

      const currentQueueItem = a.status === 'completed' ? null : (queue[currentIndex] || null);
      const currentProductObj = currentQueueItem
        ? data.products.find((p) => p.id === currentQueueItem.productId)
        : null;

      const nextIndex = currentIndex + 1;
      let nextQueueItem = null;
      if (a.status !== 'completed') {
        if (nextIndex < queue.length) {
          nextQueueItem = queue[nextIndex];
        } else if (a.onComplete === 'restart' && queue.length > 0) {
          nextQueueItem = queue[0];
        }
      }
      const nextProductObj = nextQueueItem
        ? data.products.find((p) => p.id === nextQueueItem.productId)
        : null;

      const cycleText = a.onComplete === 'stop'
        ? 'Ciclo único'
        : `Ciclo ${a.currentCycle || 1}`;

      const automationJobs = data.message_jobs.filter((j) => j.automationId === a.id);
      const totalErrors = automationJobs.filter((j) => j.status === 'failed').length;

      return {
        ...a,
        type,
        groupName,
        groupCount,
        cycleText,
        totalProducts,
        sentCount,
        waitingCount,
        errorCount,
        totalErrors,
        remainingProducts: Math.max(0, totalProducts - sentCount),
        currentProduct: currentProductObj
          ? {
              id: currentProductObj.id,
              name: currentProductObj.productName,
              price: currentProductObj.priceMin,
              imageUrl: currentProductObj.imageUrl || null,
            }
          : (type !== 'product' && a.content ? { id: 'msg', name: a.content.substring(0, 40), price: null, imageUrl: null } : null),
        nextProduct: nextProductObj
          ? {
              id: nextProductObj.id,
              name: nextProductObj.productName,
              price: nextProductObj.priceMin,
              imageUrl: nextProductObj.imageUrl || null,
            }
          : null,
        progressPercent,
      };
    });

    return NextResponse.json({ success: true, automations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      type = 'product', // 'product' | 'message' | 'recurring_message'
      configurationGroupId,
      targetGroups, // string[]
      content, // free text message
      linkUrl, // optional link
      productIds = [],
      messageTemplate,
      intervalValue = 15,
      intervalUnit = 'minutes',
      groupDelaySeconds = 2,
      productOrder = 'random', // 'random' (default) | 'sequential'
      startTime = '08:00',
      endTime = '22:00',
      daysOfWeek,
      timezone = 'America/Bahia',
      onComplete = 'stop',
      sendNow = false,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'O nome da automação é obrigatório.' }, { status: 400 });
    }

    const hasConfigGroup = !!configurationGroupId;
    const hasTargetGroups = Array.isArray(targetGroups) && targetGroups.length > 0;
    if (!hasConfigGroup && !hasTargetGroups) {
      return NextResponse.json({ error: 'Selecione pelo menos um grupo de WhatsApp ou um Grupo de Configuração.' }, { status: 400 });
    }

    if (type === 'product' && (!Array.isArray(productIds) || productIds.length === 0)) {
      return NextResponse.json({ error: 'Selecione pelo menos um produto para a automação de Oferta/Produto.' }, { status: 400 });
    }

    if ((type === 'message' || type === 'recurring_message') && (!content || !content.trim()) && !linkUrl) {
      return NextResponse.json({ error: 'Escreva o texto da mensagem ou informe um link.' }, { status: 400 });
    }

    const intervalMinutes = intervalUnit === 'hours' ? intervalValue * 60 : intervalValue;
    const safeGroupDelay = Math.min(30, Math.max(0, Number(groupDelaySeconds) ?? 2));
    const now = new Date().toISOString();
    const automationId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const inWindow = SchedulerService.isWithinTimeWindow(startTime, endTime, timezone, daysOfWeek);
    let initialNextRun: string | null = null;
    if (type === 'message') {
      initialNextRun = sendNow ? now : null;
    } else {
      if (sendNow || inWindow) {
        initialNextRun = now;
      } else {
        initialNextRun = SchedulerService.calculateNextRunTime(
          intervalMinutes,
          startTime,
          endTime,
          timezone,
          daysOfWeek
        );
      }
    }

    const newAutomation: Automation = {
      id: automationId,
      name: name.trim(),
      type: type as any,
      configurationGroupId: configurationGroupId || null,
      targetGroups: hasTargetGroups ? targetGroups : undefined,
      content: content ? content.trim() : null,
      linkUrl: linkUrl ? linkUrl.trim() : null,
      messageTemplate: messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
      intervalMinutes: Math.max(1, intervalMinutes),
      groupDelaySeconds: safeGroupDelay,
      productOrder: productOrder === 'sequential' ? 'sequential' : 'random',
      startTime,
      endTime,
      daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : undefined,
      timezone,
      onComplete: onComplete === 'restart' ? 'restart' : 'stop',
      status: type === 'message' && !sendNow ? 'paused' : 'active',
      currentProductIndex: 0,
      currentCycle: 1,
      lastRunAt: null,
      nextRunAt: initialNextRun,
      createdAt: now,
      updatedAt: now,
    };

    // If random order, shuffle once with Fisher-Yates and persist
    let orderedProductIds = [...(type === 'product' ? productIds : [])];
    if (newAutomation.productOrder === 'random' && orderedProductIds.length > 1) {
      for (let i = orderedProductIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = orderedProductIds[i];
        orderedProductIds[i] = orderedProductIds[j];
        orderedProductIds[j] = temp;
      }
    }

    const automationProducts: AutomationProduct[] = orderedProductIds.map(
      (pid: string, idx: number) => ({
        id: `ap-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        automationId,
        productId: pid,
        sortOrder: idx,
        status: 'pending',
        createdAt: now,
      })
    );

    db.update((d) => {
      d.automations.push(newAutomation);
      if (automationProducts.length > 0) {
        d.automation_products.push(...automationProducts);
      }

      if (type === 'product') {
        productIds.forEach((pid: string) => {
          const prod = d.products.find((p) => p.id === pid);
          if (prod && prod.status === 'available') {
            prod.status = 'waiting';
          }
        });
      }

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'automation',
        description: `Automação "${newAutomation.name}" criada (${type === 'product' ? 'Oferta/Produto' : type === 'message' ? 'Mensagem' : 'Mensagem recorrente'}).`,
        createdAt: now,
      });
    });

    // If 'sendNow' was requested for a message automation, dispatch it immediately!
    if (sendNow && (type === 'message' || type === 'recurring_message')) {
      await SchedulerService.dispatchTextMessage(newAutomation);
    }

    return NextResponse.json({ success: true, automation: newAutomation });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, action } = await req.json();

    if (!id || !action) {
      return NextResponse.json({ error: 'ID e ação são obrigatórios' }, { status: 400 });
    }

    const now = new Date().toISOString();
    let updatedStatus = '';

    db.update((d) => {
      const auto = d.automations.find((a) => a.id === id);
      if (!auto) throw new Error('Automação não encontrada');

      if (action === 'pause') {
        auto.status = 'paused';
        updatedStatus = 'paused';
      } else if (action === 'resume') {
        auto.status = 'active';
        const inWindow = SchedulerService.isWithinTimeWindow(
          auto.startTime || '08:00',
          auto.endTime || '22:00',
          auto.timezone || 'America/Bahia',
          auto.daysOfWeek
        );
        auto.nextRunAt = inWindow
          ? now
          : SchedulerService.calculateNextRunTime(
              auto.intervalMinutes || 15,
              auto.startTime || '08:00',
              auto.endTime || '22:00',
              auto.timezone || 'America/Bahia',
              auto.daysOfWeek
            );
        updatedStatus = 'active';
      } else if (action === 'stop') {
        auto.status = 'stopped';
        auto.nextRunAt = null;
        updatedStatus = 'stopped';
      } else if (action === 'restart') {
        auto.status = 'active';
        auto.currentProductIndex = 0;
        auto.currentCycle = (auto.currentCycle || 1) + 1;
        const inWindow = SchedulerService.isWithinTimeWindow(
          auto.startTime || '08:00',
          auto.endTime || '22:00',
          auto.timezone || 'America/Bahia',
          auto.daysOfWeek
        );
        auto.nextRunAt = inWindow
          ? now
          : SchedulerService.calculateNextRunTime(
              auto.intervalMinutes || 15,
              auto.startTime || '08:00',
              auto.endTime || '22:00',
              auto.timezone || 'America/Bahia',
              auto.daysOfWeek
            );
        auto.completedAt = null;
        updatedStatus = 'active';

        // Reset queue items back to pending for the new cycle
        const queueItems = d.automation_products.filter((ap) => ap.automationId === id);
        if (auto.productOrder === 'random') {
          for (let i = queueItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = queueItems[i];
            queueItems[i] = queueItems[j];
            queueItems[j] = temp;
          }
          queueItems.forEach((ap, idx) => {
            ap.sortOrder = idx;
            ap.status = 'pending';
          });
        } else {
          queueItems.forEach((ap) => {
            ap.status = 'pending';
          });
        }
      } else {
        throw new Error('Ação inválida. Use pause, resume, stop ou restart.');
      }

      auto.updatedAt = now;

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'automation',
        description: `Automação "${auto.name}" teve status alterado para "${updatedStatus}".`,
        createdAt: now,
      });
    });

    return NextResponse.json({ success: true, status: updatedStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID da automação não fornecido' }, { status: 400 });
    }

    db.update((d) => {
      d.automations = d.automations.filter((a) => a.id !== id);
      d.automation_products = d.automation_products.filter((ap) => ap.automationId !== id);
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

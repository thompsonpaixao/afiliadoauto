import { Hono } from 'hono';
import { Env, AutomationRow } from '../types';
import { DatabaseService } from '../services/db';
import { WorkerScheduler } from '../services/scheduler';

export const automationRoutes = new Hono<{ Bindings: Env }>();

const DEFAULT_MESSAGE_TEMPLATE = `*{{nome}}*

⭐⭐⭐⭐⭐

~De R$ {{preco_anterior}}~

✅ *Por R$ {{preco_atual}}*

🎟️ *CUPOM: {{cupom}}*

{{link}}`;

// GET /api/automations
automationRoutes.get('/', async (c) => {
  try {
    const db = new DatabaseService(c.env.DB);
    const automations = await db.getAutomations();
    return c.json({ success: true, automations });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/automations
automationRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      name,
      configurationGroupId,
      productIds,
      messageTemplate,
      intervalValue = 10,
      intervalUnit = 'minutes',
      startTime = '08:00',
      endTime = '22:00',
      timezone = 'America/Bahia',
      onComplete = 'stop',
    } = body;

    if (!name || !name.trim()) {
      return c.json({ error: 'O nome da automação é obrigatório.' }, 400);
    }

    if (!configurationGroupId) {
      return c.json({ error: 'Selecione um Grupo de Configuração.' }, 400);
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return c.json({ error: 'Selecione pelo menos um produto para a automação.' }, 400);
    }

    const intervalMinutes = intervalUnit === 'hours' ? intervalValue * 60 : intervalValue;
    const db = new DatabaseService(c.env.DB);

    const autoId = await db.createAutomation({
      name: name.trim(),
      configurationGroupId,
      productIds,
      messageTemplate: messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
      intervalMinutes: Math.max(1, intervalMinutes),
      startTime,
      endTime,
      timezone,
      onComplete: onComplete === 'restart' ? 'restart' : 'stop',
    });

    await c.env.DB
      .prepare('INSERT INTO activity_logs (id, type, description) VALUES (?, "automation", ?)')
      .bind(
        `log-${Date.now()}`,
        `Automação "${name.trim()}" criada com ${productIds.length} produto(s).`
      )
      .run();

    return c.json({
      success: true,
      automation: { id: autoId, name: name.trim() },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/automations
automationRoutes.put('/', async (c) => {
  try {
    const { id, action } = await c.req.json();

    if (!id || !action) {
      return c.json({ error: 'ID e ação são obrigatórios' }, 400);
    }

    const db = new DatabaseService(c.env.DB);

    if (action === 'pause') {
      await db.updateAutomationStatus(id, 'paused');
    } else if (action === 'resume') {
      await db.updateAutomationStatus(id, 'active');
    } else if (action === 'stop') {
      await db.updateAutomationStatus(id, 'stopped');
    } else {
      return c.json({ error: 'Ação inválida. Use pause, resume ou stop.' }, 400);
    }

    await c.env.DB
      .prepare('INSERT INTO activity_logs (id, type, description) VALUES (?, "automation", ?)')
      .bind(`log-${Date.now()}`, `Automação ${id} teve status alterado para "${action}".`)
      .run();

    return c.json({ success: true, status: action });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/automations
automationRoutes.delete('/', async (c) => {
  try {
    const { id } = await c.req.json();
    if (!id) {
      return c.json({ error: 'ID da automação não fornecido' }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    await db.deleteAutomation(id);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/automations/:id/dispatch (Manual trigger of next product)
automationRoutes.post('/:id/dispatch', async (c) => {
  try {
    const id = c.req.param('id');
    const auto = await c.env.DB
      .prepare('SELECT * FROM automations WHERE id = ?')
      .bind(id)
      .first<AutomationRow>();

    if (!auto) {
      return c.json({ error: 'Automação não encontrada' }, 404);
    }

    const scheduler = new WorkerScheduler(c.env);
    const success = await scheduler.dispatchNextProduct(auto);

    return c.json({ success });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

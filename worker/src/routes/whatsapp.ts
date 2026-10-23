import { Hono } from 'hono';
import { Env } from '../types';
import { DatabaseService } from '../services/db';
import { WorkerEvolutionClient } from '../services/evolution';

export const whatsappRoutes = new Hono<{ Bindings: Env }>();

// GET /api/whatsapp/status
whatsappRoutes.get('/status', async (c) => {
  try {
    const client = new WorkerEvolutionClient(c.env);
    const status = await client.getStatus();
    return c.json(status);
  } catch (err: any) {
    return c.json(
      {
        status: 'SERVICE_UNAVAILABLE',
        connected: false,
        error: err.message,
      },
      500
    );
  }
});

// POST /api/whatsapp/connect (Trigger connection & generate QR Code)
whatsappRoutes.post('/connect', async (c) => {
  try {
    const client = new WorkerEvolutionClient(c.env);
    const result = await client.connect();
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/whatsapp/qrcode
whatsappRoutes.get('/qrcode', async (c) => {
  try {
    const client = new WorkerEvolutionClient(c.env);
    const qrCode = await client.getQrCode();
    return c.json({ success: Boolean(qrCode), qrCode });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/whatsapp/disconnect
whatsappRoutes.post('/disconnect', async (c) => {
  try {
    const client = new WorkerEvolutionClient(c.env);
    const success = await client.disconnect();
    return c.json({ success });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/whatsapp/groups
whatsappRoutes.get('/groups', async (c) => {
  try {
    const db = new DatabaseService(c.env.DB);
    const groups = await db.getWhatsAppGroups();

    return c.json({
      success: true,
      total: groups.length,
      groups: groups.map((g) => ({
        provider_group_id: g.provider_group_id,
        groupJid: g.provider_group_id,
        name: g.name,
        picture_url: g.picture_url,
        participants_count: g.participants_count,
        synced_at: g.synced_at,
        active: g.active === 1,
      })),
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/whatsapp/sync-groups
whatsappRoutes.post('/sync-groups', async (c) => {
  try {
    const client = new WorkerEvolutionClient(c.env);
    const fetchedGroups = await client.getGroups();

    const db = new DatabaseService(c.env.DB);
    await db.upsertWhatsAppGroups(fetchedGroups);

    // Update integration last sync timestamp
    await c.env.DB
      .prepare('UPDATE integrations SET last_sync = CURRENT_TIMESTAMP, status = "connected" WHERE provider = "whatsapp"')
      .run();

    await c.env.DB
      .prepare('INSERT INTO activity_logs (id, type, description) VALUES (?, "whatsapp", ?)')
      .bind(
        `log-${Date.now()}`,
        `Sincronização concluída: ${fetchedGroups.length} grupo(s) reais do WhatsApp sincronizados via Evolution API.`
      )
      .run();

    return c.json({
      success: true,
      syncedCount: fetchedGroups.length,
      groups: fetchedGroups,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err.message || 'Falha ao sincronizar grupos na Evolution API',
      },
      500
    );
  }
});

// POST /api/whatsapp/send-test
whatsappRoutes.post('/send-test', async (c) => {
  try {
    const { to, message, url } = await c.req.json();

    if (!to || !to.trim()) {
      return c.json({ error: 'O identificador do grupo (provider_group_id) é obrigatório.' }, 400);
    }

    if (!message || !message.trim()) {
      return c.json({ error: 'O conteúdo da mensagem é obrigatório.' }, 400);
    }

    const client = new WorkerEvolutionClient(c.env);
    const cleanTo = to.trim();
    const cleanMessage = message.trim();
    const cleanUrl = url && url.trim() ? url.trim() : null;

    let result;
    if (cleanUrl) {
      result = await client.sendLinkWithPreview(cleanTo, cleanUrl, cleanMessage);
    } else {
      result = await client.sendText(cleanTo, cleanMessage);
    }

    const groupRow = await c.env.DB
      .prepare('SELECT name FROM whatsapp_groups WHERE provider_group_id = ?')
      .bind(cleanTo)
      .first<{ name: string }>();
    const groupName = groupRow?.name || cleanTo;

    // Log message job
    await c.env.DB
      .prepare(
        `INSERT INTO message_jobs (
          id, automation_id, cycle_id, product_id, product_name, provider_group_id,
          group_name, idempotent_key, status, link_used, message_content,
          scheduled_for, request_started_at, response_received_at, provider_message_id,
          sent_at, error, attempts
        ) VALUES (?, 'manual-test', 1, 'test-product', 'Disparo de Teste Manual', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 1)`
      )
      .bind(
        `test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        cleanTo,
        groupName,
        `manual-test:${Date.now()}:${cleanTo}`,
        result.success ? 'sent' : (result.isOffline ? 'offline_retry' : 'error'),
        cleanUrl || '',
        cleanMessage,
        result.request_started_at,
        result.response_received_at,
        result.provider_message_id || null,
        result.success ? new Date().toISOString() : null,
        result.error || null
      )
      .run();

    await c.env.DB
      .prepare('INSERT INTO activity_logs (id, type, description) VALUES (?, "whatsapp", ?)')
      .bind(
        `log-${Date.now()}`,
        result.success
          ? `Mensagem de teste enviada com sucesso para "${groupName}".`
          : `Falha no teste para "${groupName}": ${result.error}`
      )
      .run();

    return c.json({
      success: result.success,
      result,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

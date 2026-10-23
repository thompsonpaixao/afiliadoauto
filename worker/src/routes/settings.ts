import { Hono } from 'hono';
import { Env } from '../types';
import { DatabaseService } from '../services/db';
import { hashPassword } from '../middleware/auth';
import { WorkerEvolutionClient } from '../services/evolution';

export const settingsRoutes = new Hono<{ Bindings: Env }>();

// GET /api/settings
settingsRoutes.get('/', async (c) => {
  try {
    const db = new DatabaseService(c.env.DB);
    await db.ensureInitialized();

    const admin = await db.getAdmin();
    const shopee = await c.env.DB.prepare('SELECT * FROM integrations WHERE provider = "shopee"').first<any>();
    const whatsapp = await c.env.DB.prepare('SELECT * FROM integrations WHERE provider = "whatsapp"').first<any>();

    const { results: settingsRows } = await c.env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
    const settingsMap: Record<string, string> = {};
    for (const row of settingsRows || []) {
      settingsMap[row.key] = row.value;
    }

    const shopeeCreds = shopee?.credentials ? JSON.parse(shopee.credentials) : {};
    const waCreds = whatsapp?.credentials ? JSON.parse(whatsapp.credentials) : {};

    return c.json({
      success: true,
      admin: {
        username: admin?.username || 'admin',
      },
      shopee: {
        appId: c.env.SHOPEE_APP_ID || shopeeCreds.appId || '',
        appSecret: (c.env.SHOPEE_APP_SECRET || shopeeCreds.appSecret) ? '••••••••••••••••' : '',
        endpoint: c.env.SHOPEE_ENDPOINT || shopeeCreds.endpoint || 'https://open-api.affiliate.shopee.com.br/graphql',
        hasSecret: Boolean(c.env.SHOPEE_APP_SECRET || shopeeCreds.appSecret),
        status: (c.env.SHOPEE_APP_ID && c.env.SHOPEE_APP_SECRET) || shopee?.status === 'connected' ? 'connected' : 'disconnected',
      },
      whatsapp: {
        endpoint: c.env.OPENWA_BASE_URL || waCreds.endpoint || 'http://127.0.0.1:8080',
        apiKey: (c.env.OPENWA_API_KEY || waCreds.apiKey) ? '••••••••' : '',
        hasKey: Boolean(c.env.OPENWA_API_KEY || waCreds.apiKey),
        sessionId: c.env.OPENWA_SESSION_ID || waCreds.sessionId || 'afiliado-auto',
        status: whatsapp?.status || 'disconnected',
        lastSync: whatsapp?.last_sync || null,
      },
      settings: {
        timezone: settingsMap['timezone'] || c.env.TIMEZONE || 'America/Bahia',
        defaultTemplate: settingsMap['default_template'] || '',
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/settings
settingsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { section, payload } = body;
    const db = new DatabaseService(c.env.DB);

    if (section === 'admin') {
      const { username, newPassword } = payload;
      let newHash: string | undefined;

      if (newPassword && newPassword.trim()) {
        if (newPassword.trim().length < 4) {
          return c.json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' }, 400);
        }
        newHash = await hashPassword(newPassword.trim());
      }

      await db.updateAdmin(username, newHash);
      return c.json({ success: true, message: 'Dados do administrador atualizados com sucesso.' });
    }

    if (section === 'shopee') {
      const { appId, appSecret, endpoint } = payload;
      const existing = await c.env.DB.prepare('SELECT credentials FROM integrations WHERE provider = "shopee"').first<any>();
      const creds = existing?.credentials ? JSON.parse(existing.credentials) : {};

      if (appId !== undefined) creds.appId = appId.trim();
      if (appSecret && appSecret !== '••••••••••••••••') creds.appSecret = appSecret.trim();
      if (endpoint) creds.endpoint = endpoint.trim();

      const isConnected = Boolean(creds.appId && creds.appSecret);

      await c.env.DB
        .prepare(
          `INSERT INTO integrations (id, provider, credentials, status, updated_at)
           VALUES ('int-shopee', 'shopee', ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(provider) DO UPDATE SET
             credentials = excluded.credentials,
             status = excluded.status,
             updated_at = CURRENT_TIMESTAMP`
        )
        .bind(JSON.stringify(creds), isConnected ? 'connected' : 'disconnected')
        .run();

      return c.json({ success: true, message: 'Configurações da Shopee salvas com sucesso.' });
    }

    if (section === 'whatsapp') {
      const { endpoint, apiKey, sessionId } = payload;
      const existing = await c.env.DB.prepare('SELECT credentials FROM integrations WHERE provider = "whatsapp"').first<any>();
      const creds = existing?.credentials ? JSON.parse(existing.credentials) : {};

      if (endpoint) creds.endpoint = endpoint.trim();
      if (apiKey && apiKey !== '••••••••') creds.apiKey = apiKey.trim();
      if (sessionId) creds.sessionId = sessionId.trim();

      await c.env.DB
        .prepare(
          `INSERT INTO integrations (id, provider, credentials, status, updated_at)
           VALUES ('int-whatsapp', 'whatsapp', ?, 'disconnected', CURRENT_TIMESTAMP)
           ON CONFLICT(provider) DO UPDATE SET
             credentials = excluded.credentials,
             updated_at = CURRENT_TIMESTAMP`
        )
        .bind(JSON.stringify(creds))
        .run();

      return c.json({ success: true, message: 'Configurações do WhatsApp salvas com sucesso.' });
    }

    if (section === 'general') {
      const { timezone, defaultTemplate } = payload;
      if (timezone) {
        await c.env.DB
          .prepare('INSERT INTO settings (key, value) VALUES ("timezone", ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .bind(timezone)
          .run();
      }
      if (defaultTemplate) {
        await c.env.DB
          .prepare('INSERT INTO settings (key, value) VALUES ("default_template", ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .bind(defaultTemplate)
          .run();
      }
      return c.json({ success: true, message: 'Configurações gerais salvas.' });
    }

    if (section === 'test_whatsapp') {
      const client = new WorkerEvolutionClient(c.env);
      const status = await client.getStatus();
      return c.json({ success: status.connected, status });
    }

    return c.json({ error: 'Seção não reconhecida' }, 400);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

import { Hono } from 'hono';
import { Env } from '../types';
import { DatabaseService } from '../services/db';

export const groupRoutes = new Hono<{ Bindings: Env }>();

// GET /api/groups
groupRoutes.get('/', async (c) => {
  try {
    const db = new DatabaseService(c.env.DB);
    const configurationGroups = await db.getConfigurationGroups();
    const whatsappGroups = await db.getWhatsAppGroups();

    // Map whatsapp groups to expected frontend shape
    const formattedWaGroups = whatsappGroups.map((g) => ({
      provider_group_id: g.provider_group_id,
      groupJid: g.provider_group_id,
      name: g.name,
      picture_url: g.picture_url,
      imageUrl: g.picture_url,
      participants_count: g.participants_count,
      participantsCount: g.participants_count,
      active: g.active === 1,
      synced_at: g.synced_at,
    }));

    return c.json({
      success: true,
      configurationGroups,
      whatsappGroups: formattedWaGroups,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/groups
groupRoutes.post('/', async (c) => {
  try {
    const { id, name, description, groupJids } = await c.req.json();

    if (!name || !name.trim()) {
      return c.json({ error: 'O nome do Grupo de Configuração é obrigatório.' }, 400);
    }

    if (!Array.isArray(groupJids) || groupJids.length === 0) {
      return c.json({ error: 'Selecione pelo menos um grupo real do WhatsApp.' }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    const savedId = await db.saveConfigurationGroup(id || null, name.trim(), description?.trim() || null, groupJids);

    await c.env.DB
      .prepare('INSERT INTO activity_logs (id, type, description) VALUES (?, "system", ?)')
      .bind(
        `log-${Date.now()}`,
        `Grupo de Configuração "${name.trim()}" salvo com ${groupJids.length} grupo(s) do WhatsApp.`
      )
      .run();

    return c.json({
      success: true,
      configurationGroup: {
        id: savedId,
        name: name.trim(),
        description: description?.trim() || null,
        groupJids,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/groups
groupRoutes.delete('/', async (c) => {
  try {
    const { id } = await c.req.json();
    if (!id) {
      return c.json({ error: 'ID do grupo não informado' }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    await db.deleteConfigurationGroup(id);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

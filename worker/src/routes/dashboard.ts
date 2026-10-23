import { Hono } from 'hono';
import { Env, AutomationRow, MessageJobRow } from '../types';
import { DatabaseService } from '../services/db';
import { WorkerShopeeClient } from '../services/shopee';

export const dashboardRoutes = new Hono<{ Bindings: Env }>();

// GET /api/dashboard
dashboardRoutes.get('/', async (c) => {
  try {
    const db = new DatabaseService(c.env.DB);
    await db.ensureInitialized();

    // 1. Product stats
    const { counts } = await db.getProducts('all');

    // 2. Message jobs stats
    const postedTodayRaw = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM message_jobs WHERE status = "sent" AND date(created_at) = date("now")')
      .first<{ count: number }>();
    const postedToday = postedTodayRaw?.count || 0;

    const errorsCountRaw = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM message_jobs WHERE status IN ("error", "offline_retry")')
      .first<{ count: number }>();
    const errorsCount = errorsCountRaw?.count || 0;

    // 3. Active automations count
    const activeAutomationsRaw = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM automations WHERE status = "active"')
      .first<{ count: number }>();
    const activeAutomations = activeAutomationsRaw?.count || 0;

    // 4. Integrations state
    const shopeeClient = new WorkerShopeeClient(c.env);
    const lastConvRaw = await c.env.DB
      .prepare('SELECT created_at FROM link_conversions ORDER BY created_at DESC LIMIT 1')
      .first<{ created_at: string }>();

    const waIntegration = await c.env.DB
      .prepare('SELECT * FROM integrations WHERE provider = "whatsapp"')
      .first<any>();

    const waGroupCount = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM whatsapp_groups WHERE active = 1')
      .first<{ count: number }>();

    // 5. Active automations progress list
    const { results: activeAutos } = await c.env.DB
      .prepare('SELECT * FROM automations ORDER BY created_at DESC')
      .all<AutomationRow>();

    const configGroups = await db.getConfigurationGroups();
    const configMap = new Map(configGroups.map((cg) => [cg.id, cg]));

    const activeAutomationsList = [];
    for (const a of activeAutos || []) {
      const configGroup = configMap.get(a.configuration_group_id);
      const queueRaw = await c.env.DB
        .prepare('SELECT product_id FROM automation_products WHERE automation_id = ? ORDER BY sort_order ASC')
        .bind(a.id)
        .all<{ product_id: string }>();

      const queue = queueRaw.results || [];
      const total = queue.length;
      const currentIndex = a.current_product_index || 0;
      const currentQueueItem = queue[currentIndex] || null;

      let currentProductName = 'Aguardando';
      if (currentQueueItem) {
        const prod = await c.env.DB
          .prepare('SELECT product_name FROM products WHERE id = ?')
          .bind(currentQueueItem.product_id)
          .first<{ product_name: string }>();
        if (prod) currentProductName = prod.product_name;
      }

      const progressPercent = total > 0 ? Math.min(100, Math.round((currentIndex / total) * 100)) : 0;

      activeAutomationsList.push({
        id: a.id,
        name: a.name,
        groupName: configGroup?.name || 'Grupo não configurado',
        total,
        current: currentIndex + 1,
        remaining: Math.max(0, total - currentIndex),
        currentProductName,
        progressPercent,
        nextRunAt: a.next_run_at,
        status: a.status,
      });
    }

    // 6. Recent activity (last 10 jobs)
    const { results: recentJobs } = await c.env.DB
      .prepare('SELECT * FROM message_jobs ORDER BY created_at DESC LIMIT 10')
      .all<MessageJobRow>();

    const autoMap = new Map((activeAutos || []).map((a) => [a.id, a.name]));

    const recentActivity = (recentJobs || []).map((job) => ({
      id: job.id,
      time: job.sent_at || job.created_at,
      productName: job.product_name,
      automationName: autoMap.get(job.automation_id) || 'Manual',
      groupName: job.group_name,
      status: job.status,
      error: job.error,
    }));

    return c.json({
      success: true,
      stats: {
        availableProducts: counts.available,
        waitingProducts: counts.waiting,
        postedToday,
        activeAutomations,
        errorsCount,
      },
      integrations: {
        shopee: {
          connected: Boolean(c.env.SHOPEE_APP_ID && c.env.SHOPEE_APP_SECRET),
          lastConversion: lastConvRaw?.created_at || null,
          totalProducts: counts.all,
        },
        whatsapp: {
          connected: waIntegration?.status === 'connected',
          phone: waIntegration?.credentials ? JSON.parse(waIntegration.credentials).phone : null,
          totalGroups: waGroupCount?.count || 0,
          lastSync: waIntegration?.last_sync || null,
        },
      },
      activeAutomations: activeAutomationsList,
      recentActivity,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

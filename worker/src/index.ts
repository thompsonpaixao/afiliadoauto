import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, BatchQueueMessage } from './types';
import { DatabaseService } from './services/db';
import { WorkerScheduler } from './services/scheduler';
import { handleQueueBatch } from './services/queue-consumer';

// Route modules
import { authRoutes } from './routes/auth';
import { shopeeRoutes } from './routes/shopee';
import { productRoutes } from './routes/products';
import { groupRoutes } from './routes/groups';
import { automationRoutes } from './routes/automations';
import { whatsappRoutes } from './routes/whatsapp';
import { historyRoutes } from './routes/history';
import { dashboardRoutes } from './routes/dashboard';
import { settingsRoutes } from './routes/settings';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for frontend requests (Vercel and local dev)
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  exposeHeaders: ['Set-Cookie'],
  credentials: true,
  maxAge: 86400,
}));

// Auto-initialize DB on first request
app.use('*', async (c, next) => {
  if (c.env.DB) {
    const db = new DatabaseService(c.env.DB);
    await db.ensureInitialized();
  }
  await next();
});

// Health check
app.get('/', (c) => c.json({ service: 'Afiliado Auto API', status: 'online', version: '1.0.0' }));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Mount API routes
app.route('/api/auth', authRoutes);
app.route('/api/shopee', shopeeRoutes);
app.route('/api/products', productRoutes);
app.route('/api/groups', groupRoutes);
app.route('/api/automations', automationRoutes);
app.route('/api/whatsapp', whatsappRoutes);
app.route('/api/history', historyRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/settings', settingsRoutes);

// Manual cron tick trigger endpoint (convenient for testing or external webhooks)
app.post('/api/cron/tick', async (c) => {
  const scheduler = new WorkerScheduler(c.env);
  const result = await scheduler.tick();
  return c.json({ success: true, ...result });
});

export default {
  // HTTP Fetch Handler
  fetch: app.fetch,

  // Cloudflare Cron Trigger Handler (executes every minute independently of browser)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const scheduler = new WorkerScheduler(env);
    ctx.waitUntil(
      scheduler.tick().then((res) => {
        if (res.processedCount > 0) {
          console.log(`[CronScheduler] Dispatched ${res.processedCount} products successfully.`);
        }
        if (res.errors.length > 0) {
          console.warn(`[CronScheduler] Warnings:`, res.errors);
        }
      })
    );
  },

  // Cloudflare Queues Consumer Handler (asynchronous batch link conversions)
  async queue(batch: MessageBatch<BatchQueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleQueueBatch(batch, env));
  },
};

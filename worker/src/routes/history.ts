import { Hono } from 'hono';
import { Env, MessageJobRow } from '../types';
import { DatabaseService } from '../services/db';
import { WorkerOpenWAClient } from '../services/openwa';

export const historyRoutes = new Hono<{ Bindings: Env }>();

// GET /api/history
historyRoutes.get('/', async (c) => {
  try {
    const status = c.req.query('status') || 'all';
    const period = c.req.query('period') || 'all';

    const db = new DatabaseService(c.env.DB);
    const jobs = await db.getHistory(status, period);

    const formattedJobs = jobs.map((j) => ({
      id: j.id,
      automationId: j.automation_id,
      cycleId: j.cycle_id,
      productId: j.product_id,
      productName: j.product_name,
      whatsappGroupJid: j.provider_group_id,
      provider_group_id: j.provider_group_id,
      groupName: j.group_name,
      idempotentKey: j.idempotent_key,
      status: j.status,
      linkUsed: j.link_used,
      subIdUsed: j.sub_id_used,
      messageContent: j.message_content,
      scheduledFor: j.scheduled_for,
      sentAt: j.sent_at,
      request_started_at: j.request_started_at,
      response_received_at: j.response_received_at,
      provider_message_id: j.provider_message_id,
      error: j.error,
      attempts: j.attempts,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    }));

    return c.json({
      success: true,
      jobs: formattedJobs,
      totalCount: formattedJobs.length,
      sentCount: formattedJobs.filter((j) => j.status === 'sent').length,
      errorCount: formattedJobs.filter((j) => j.status === 'error' || j.status === 'offline_retry').length,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/history (Retry job)
historyRoutes.post('/', async (c) => {
  try {
    const { jobId } = await c.req.json();
    if (!jobId) {
      return c.json({ error: 'ID do disparo não fornecido.' }, 400);
    }

    const job = await c.env.DB
      .prepare('SELECT * FROM message_jobs WHERE id = ?')
      .bind(jobId)
      .first<MessageJobRow>();

    if (!job) {
      return c.json({ error: 'Disparo não encontrado' }, 404);
    }

    const client = new WorkerOpenWAClient(c.env);
    let result;

    if (job.link_used) {
      result = await client.sendLinkWithPreview(job.provider_group_id, job.link_used, job.message_content);
    } else {
      result = await client.sendText(job.provider_group_id, job.message_content);
    }

    const newStatus = result.success ? 'sent' : (result.isOffline ? 'offline_retry' : 'error');

    await c.env.DB
      .prepare(
        `UPDATE message_jobs SET
          status = ?,
          sent_at = ?,
          provider_message_id = ?,
          error = ?,
          attempts = attempts + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        newStatus,
        result.success ? new Date().toISOString() : null,
        result.provider_message_id || null,
        result.error || null,
        job.id
      )
      .run();

    return c.json({
      success: result.success,
      status: newStatus,
      result,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

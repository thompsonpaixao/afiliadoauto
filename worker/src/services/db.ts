import { Env, ProductRow, WhatsAppGroupRow, ConfigurationGroupRow, AutomationRow, MessageJobRow } from '../types';
import { hashPassword } from '../middleware/auth';

export class DatabaseService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // Ensure default admin and default settings exist
  public async ensureInitialized(): Promise<void> {
    try {
      const admin = await this.db.prepare('SELECT id FROM admins LIMIT 1').first();
      if (!admin) {
        const defaultHash = await hashPassword('admin123');
        await this.db
          .prepare(
            'INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)'
          )
          .bind('admin-1', 'admin', defaultHash)
          .run();
      }

      // Default settings
      await this.db
        .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
        .bind('timezone', 'America/Bahia')
        .run();

      await this.db
        .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
        .bind(
          'default_template',
          `*{{nome}}*\n\n⭐⭐⭐⭐⭐\n\n~De R$ {{preco_anterior}}~\n\n✅ *Por R$ {{preco_atual}}*\n\n🎟️ *CUPOM: {{cupom}}*\n\n{{link}}`
        )
        .run();
    } catch (e: any) {
      console.warn('Init check error:', e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // ADMINS
  // ---------------------------------------------------------------------------
  public async getAdmin(): Promise<{ id: string; username: string; password_hash: string } | null> {
    return this.db.prepare('SELECT * FROM admins LIMIT 1').first();
  }

  public async updateAdmin(username?: string, passwordHash?: string): Promise<void> {
    const admin = await this.getAdmin();
    if (!admin) throw new Error('Administrador não encontrado');

    const newUsername = username && username.trim() ? username.trim() : admin.username;
    const newHash = passwordHash || admin.password_hash;

    await this.db
      .prepare('UPDATE admins SET username = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newUsername, newHash, admin.id)
      .run();
  }

  // ---------------------------------------------------------------------------
  // PRODUCTS
  // ---------------------------------------------------------------------------
  public async getProducts(status: string = 'all', search: string = ''): Promise<{
    counts: { all: number; available: number; waiting: number; posted: number; error: number };
    products: ProductRow[];
  }> {
    // 1. Get real counts for all tabs
    const countsRaw = await this.db
      .prepare(
        `SELECT
          COUNT(*) as all_count,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_count,
          SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting_count,
          SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
        FROM products`
      )
      .first<{
        all_count: number;
        available_count: number;
        waiting_count: number;
        posted_count: number;
        error_count: number;
      }>();

    const counts = {
      all: countsRaw?.all_count || 0,
      available: countsRaw?.available_count || 0,
      waiting: countsRaw?.waiting_count || 0,
      posted: countsRaw?.posted_count || 0,
      error: countsRaw?.error_count || 0,
    };

    // 2. Fetch filtered products
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];

    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      query += ' AND (product_name LIKE ? OR product_link LIKE ? OR affiliate_link LIKE ? OR sub_ids LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all<ProductRow>();

    return {
      counts,
      products: results || [],
    };
  }

  public async upsertProduct(product: Partial<ProductRow>): Promise<void> {
    const existing = await this.db
      .prepare('SELECT id FROM products WHERE product_link = ?')
      .bind(product.product_link)
      .first<{ id: string }>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE products SET
            product_name = ?,
            affiliate_link = ?,
            image_url = ?,
            price_min = ?,
            price_max = ?,
            price_previous = ?,
            commission_rate = ?,
            seller_commission_rate = ?,
            shopee_commission_rate = ?,
            commission = ?,
            rating_star = ?,
            sales = ?,
            shop_name = ?,
            sub_ids = ?,
            status = 'available',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`
        )
        .bind(
          product.product_name,
          product.affiliate_link,
          product.image_url || null,
          product.price_min || 0,
          product.price_max || null,
          product.price_previous || null,
          product.commission_rate || null,
          product.seller_commission_rate || null,
          product.shopee_commission_rate || null,
          product.commission || null,
          product.rating_star || null,
          product.sales || null,
          product.shop_name || null,
          product.sub_ids || null,
          existing.id
        )
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO products (
            id, item_id, shop_id, product_name, product_link, offer_link, affiliate_link,
            image_url, price_min, price_max, price_previous, commission_rate,
            seller_commission_rate, shopee_commission_rate, commission, rating_star,
            price_discount_rate, sales, shop_name, coupon_code, sub_ids, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`
        )
        .bind(
          product.id,
          product.item_id || null,
          product.shop_id || null,
          product.product_name,
          product.product_link,
          product.offer_link || null,
          product.affiliate_link,
          product.image_url || null,
          product.price_min || 0,
          product.price_max || null,
          product.price_previous || null,
          product.commission_rate || null,
          product.seller_commission_rate || null,
          product.shopee_commission_rate || null,
          product.commission || null,
          product.rating_star || null,
          product.price_discount_rate || null,
          product.sales || null,
          product.shop_name || null,
          product.coupon_code || null,
          product.sub_ids || null
        )
        .run();
    }
  }

  public async deleteProducts(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await this.db.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).bind(...ids).run();
  }

  // ---------------------------------------------------------------------------
  // WHATSAPP GROUPS
  // ---------------------------------------------------------------------------
  public async getWhatsAppGroups(): Promise<WhatsAppGroupRow[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM whatsapp_groups ORDER BY active DESC, name ASC')
      .all<WhatsAppGroupRow>();
    return results || [];
  }

  public async upsertWhatsAppGroups(
    groups: Array<{
      provider_group_id: string;
      name: string;
      picture_url?: string | null;
      participants_count?: number | null;
    }>
  ): Promise<void> {
    const fetchedIds = new Set(groups.map((g) => g.provider_group_id));

    const statements: D1PreparedStatement[] = [];

    // 1. Upsert each group
    for (const g of groups) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO whatsapp_groups (id, provider_group_id, name, picture_url, participants_count, active, synced_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(provider_group_id) DO UPDATE SET
               name = excluded.name,
               picture_url = excluded.picture_url,
               participants_count = excluded.participants_count,
               active = 1,
               synced_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP`
          )
          .bind(
            `grp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            g.provider_group_id,
            g.name,
            g.picture_url || null,
            g.participants_count || 0
          )
      );
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }

    // 2. Mark absent groups as inactive (never delete)
    const existing = await this.getWhatsAppGroups();
    const absentIds = existing.filter((g) => !fetchedIds.has(g.provider_group_id)).map((g) => g.provider_group_id);

    if (absentIds.length > 0) {
      const placeholders = absentIds.map(() => '?').join(',');
      await this.db
        .prepare(`UPDATE whatsapp_groups SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE provider_group_id IN (${placeholders})`)
        .bind(...absentIds)
        .run();
    }
  }

  // ---------------------------------------------------------------------------
  // CONFIGURATION GROUPS
  // ---------------------------------------------------------------------------
  public async getConfigurationGroups(): Promise<Array<ConfigurationGroupRow & { groupJids: string[] }>> {
    const { results: groups } = await this.db
      .prepare('SELECT * FROM configuration_groups ORDER BY created_at DESC')
      .all<ConfigurationGroupRow>();

    const { results: members } = await this.db
      .prepare('SELECT configuration_group_id, provider_group_id FROM configuration_group_members')
      .all<{ configuration_group_id: string; provider_group_id: string }>();

    const memberMap = new Map<string, string[]>();
    for (const m of members || []) {
      if (!memberMap.has(m.configuration_group_id)) {
        memberMap.set(m.configuration_group_id, []);
      }
      memberMap.get(m.configuration_group_id)!.push(m.provider_group_id);
    }

    return (groups || []).map((g) => ({
      ...g,
      groupJids: memberMap.get(g.id) || [],
    }));
  }

  public async saveConfigurationGroup(id: string | null, name: string, description: string | null, groupJids: string[]): Promise<string> {
    const targetId = id || `cfg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const statements: D1PreparedStatement[] = [];

    if (id) {
      statements.push(
        this.db
          .prepare('UPDATE configuration_groups SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(name, description, id)
      );
      statements.push(
        this.db.prepare('DELETE FROM configuration_group_members WHERE configuration_group_id = ?').bind(id)
      );
    } else {
      statements.push(
        this.db
          .prepare('INSERT INTO configuration_groups (id, name, description) VALUES (?, ?, ?)')
          .bind(targetId, name, description)
      );
    }

    for (const jid of groupJids) {
      statements.push(
        this.db
          .prepare('INSERT INTO configuration_group_members (id, configuration_group_id, provider_group_id) VALUES (?, ?, ?)')
          .bind(`cgm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, targetId, jid)
      );
    }

    await this.db.batch(statements);
    return targetId;
  }

  public async deleteConfigurationGroup(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM configuration_group_members WHERE configuration_group_id = ?').bind(id),
      this.db.prepare('DELETE FROM configuration_groups WHERE id = ?').bind(id),
    ]);
  }

  // ---------------------------------------------------------------------------
  // AUTOMATIONS
  // ---------------------------------------------------------------------------
  public async getAutomations(): Promise<any[]> {
    const { results: automations } = await this.db
      .prepare('SELECT * FROM automations ORDER BY created_at DESC')
      .all<AutomationRow>();

    const configGroups = await this.getConfigurationGroups();
    const configMap = new Map(configGroups.map((cg) => [cg.id, cg]));

    const enriched = [];
    for (const auto of automations || []) {
      const configGroup = configMap.get(auto.configuration_group_id);

      const queue = await this.db
        .prepare('SELECT * FROM automation_products WHERE automation_id = ? ORDER BY sort_order ASC')
        .bind(auto.id)
        .all<{ id: string; product_id: string; sort_order: number; status: string }>();

      const queueItems = queue.results || [];
      const total = queueItems.length;
      const currentQueueItem = queueItems[auto.current_product_index] || null;

      let currentProduct = null;
      if (currentQueueItem) {
        currentProduct = await this.db
          .prepare('SELECT id, product_name, price_min FROM products WHERE id = ?')
          .bind(currentQueueItem.product_id)
          .first();
      }

      const progressPercent = total > 0 ? Math.min(100, Math.round((auto.current_product_index / total) * 100)) : 0;

      enriched.push({
        id: auto.id,
        name: auto.name,
        configurationGroupId: auto.configuration_group_id,
        groupName: configGroup?.name || 'Grupo não encontrado',
        groupCount: configGroup?.groupJids?.length || 0,
        messageTemplate: auto.message_template,
        intervalMinutes: auto.interval_minutes,
        startTime: auto.start_time,
        endTime: auto.end_time,
        timezone: auto.timezone,
        onComplete: auto.on_complete,
        status: auto.status,
        currentCycle: auto.current_cycle,
        currentProductIndex: auto.current_product_index,
        totalProducts: total,
        remainingProducts: Math.max(0, total - auto.current_product_index),
        currentProduct,
        progressPercent,
        nextRunAt: auto.next_run_at,
        lastRunAt: auto.last_run_at,
        createdAt: auto.created_at,
      });
    }

    return enriched;
  }

  public async createAutomation(params: {
    name: string;
    configurationGroupId: string;
    productIds: string[];
    messageTemplate: string;
    intervalMinutes: number;
    startTime: string;
    endTime: string;
    timezone: string;
    onComplete: 'stop' | 'restart';
  }): Promise<string> {
    const autoId = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO automations (
            id, name, configuration_group_id, message_template, interval_minutes,
            start_time, end_time, timezone, on_complete, status, current_product_index,
            current_cycle, next_run_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 1, CURRENT_TIMESTAMP)`
        )
        .bind(
          autoId,
          params.name,
          params.configurationGroupId,
          params.messageTemplate,
          params.intervalMinutes,
          params.startTime,
          params.endTime,
          params.timezone,
          params.onComplete
        ),
    ];

    params.productIds.forEach((pid, idx) => {
      statements.push(
        this.db
          .prepare(
            'INSERT INTO automation_products (id, automation_id, product_id, sort_order, status) VALUES (?, ?, ?, ?, ?)'
          )
          .bind(`ap-${Date.now()}-${idx}`, autoId, pid, idx, 'waiting')
      );
      statements.push(
        this.db.prepare('UPDATE products SET status = "waiting" WHERE id = ? AND status = "available"').bind(pid)
      );
    });

    await this.db.batch(statements);
    return autoId;
  }

  public async updateAutomationStatus(id: string, status: 'active' | 'paused' | 'stopped'): Promise<void> {
    const nextRun = status === 'active' ? 'CURRENT_TIMESTAMP' : 'next_run_at';
    await this.db
      .prepare(`UPDATE automations SET status = ?, next_run_at = ${nextRun}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(status, id)
      .run();
  }

  public async deleteAutomation(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM automation_products WHERE automation_id = ?').bind(id),
      this.db.prepare('DELETE FROM automations WHERE id = ?').bind(id),
    ]);
  }

  // ---------------------------------------------------------------------------
  // MESSAGE JOBS & HISTORY
  // ---------------------------------------------------------------------------
  public async getHistory(status: string = 'all', period: string = 'all'): Promise<MessageJobRow[]> {
    let query = 'SELECT * FROM message_jobs WHERE 1=1';
    const params: any[] = [];

    if (status === 'sent') {
      query += ' AND status = "sent"';
    } else if (status === 'error') {
      query += ' AND status IN ("error", "offline_retry")';
    }

    if (period === 'today') {
      query += ' AND date(created_at) = date("now")';
    } else if (period === '7d') {
      query += ' AND created_at >= datetime("now", "-7 days")';
    } else if (period === '30d') {
      query += ' AND created_at >= datetime("now", "-30 days")';
    }

    query += ' ORDER BY created_at DESC LIMIT 200';

    const { results } = await this.db.prepare(query).bind(...params).all<MessageJobRow>();
    return results || [];
  }

  // ---------------------------------------------------------------------------
  // BATCH IMPORTS (Cloudflare Queues tracker)
  // ---------------------------------------------------------------------------
  public async createBatchImport(batchId: string, totalLinks: number): Promise<void> {
    await this.db
      .prepare('INSERT INTO batch_imports (id, status, total_links, processed_count, converted_count, error_count) VALUES (?, "pending", ?, 0, 0, 0)')
      .bind(batchId, totalLinks)
      .run();
  }

  public async updateBatchProgress(batchId: string, processed: number, converted: number, errors: number, isDone: boolean): Promise<void> {
    const status = isDone ? (errors > 0 ? 'partial' : 'completed') : 'processing';
    await this.db
      .prepare(
        `UPDATE batch_imports SET
          status = ?,
          processed_count = processed_count + ?,
          converted_count = converted_count + ?,
          error_count = error_count + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
      )
      .bind(status, processed, converted, errors, batchId)
      .run();
  }

  public async getBatchImport(batchId: string): Promise<any> {
    return this.db.prepare('SELECT * FROM batch_imports WHERE id = ?').bind(batchId).first();
  }
}

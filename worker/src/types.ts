export interface Env {
  // Cloudflare D1 Database Binding
  DB: D1Database;

  // Cloudflare Queues Binding
  IMPORT_QUEUE: Queue<BatchQueueMessage>;

  // Cloudflare R2 Bucket Binding (Optional)
  UPLOADS_BUCKET?: R2Bucket;

  // Public / non-sensitive environment variables
  ENVIRONMENT: string;
  TIMEZONE: string;
  OPENWA_BASE_URL?: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_INSTANCE?: string;

  // Secrets (definidos via `wrangler secret put`)
  EVOLUTION_API_KEY?: string;
  OPENWA_API_KEY?: string;
  OPENWA_SESSION_ID?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  SHOPEE_APP_ID?: string;
  SHOPEE_APP_SECRET?: string;
  SHOPEE_ENDPOINT?: string;
  JWT_SECRET?: string;
}

export interface BatchQueueMessage {
  batchId: string;
  urls: string[];
  subIds?: string[];
  timestamp: string;
}

export interface AdminPayload {
  id: string;
  username: string;
}

export interface ProductRow {
  id: string;
  item_id: string | null;
  shop_id: string | null;
  product_name: string;
  product_link: string;
  offer_link: string | null;
  affiliate_link: string;
  image_url: string | null;
  price_min: number;
  price_max: number | null;
  price_previous: number | null;
  commission_rate: number | null;
  seller_commission_rate: number | null;
  shopee_commission_rate: number | null;
  commission: number | null;
  rating_star: number | null;
  price_discount_rate: number | null;
  sales: number | null;
  shop_name: string | null;
  coupon_code: string | null;
  coupon_description: string | null;
  coupon_value: string | null;
  coupon_expiration: string | null;
  sub_ids: string | null; // JSON
  status: 'available' | 'waiting' | 'posted' | 'error';
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppGroupRow {
  id: string;
  provider_group_id: string;
  name: string;
  picture_url: string | null;
  participants_count: number | null;
  active: number; // 1 or 0
  synced_at: string;
  updated_at: string;
}

export interface ConfigurationGroupRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRow {
  id: string;
  name: string;
  configuration_group_id: string;
  message_template: string;
  interval_minutes: number;
  start_time: string;
  end_time: string;
  timezone: string;
  on_complete: 'stop' | 'restart';
  status: 'active' | 'paused' | 'stopped' | 'completed';
  current_product_index: number;
  current_cycle: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageJobRow {
  id: string;
  automation_id: string;
  cycle_id: number;
  product_id: string;
  product_name: string;
  provider_group_id: string;
  group_name: string;
  idempotent_key: string;
  status: 'sent' | 'error' | 'pending' | 'offline_retry';
  link_used: string;
  sub_id_used: string | null;
  message_content: string;
  scheduled_for: string;
  request_started_at: string | null;
  response_received_at: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

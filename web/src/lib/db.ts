import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'afiliado_auto.json');

export interface Admin {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface Integration {
  id: string;
  provider: 'shopee' | 'whatsapp' | 'mercadolivre' | 'amazon';
  credentials: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string | null;
  updatedAt: string;
}

export interface Product {
  id: string;
  itemId?: string | null;
  shopId?: string | null;
  productName: string;
  productLink: string;
  offerLink?: string | null;
  affiliateLink: string;
  imageUrl?: string | null;
  priceMin: number;
  priceMax?: number | null;
  pricePrevious?: number | null; // Real previous price, never invented
  currentPrice?: number;
  originalPrice?: number | null; // Exact real previous price from seller/Shopee
  discountPercent?: number | null;
  priceSource?: string | null; // 'shopee_api' | 'manual' | 'page_scrape'
  priceUpdatedAt?: string | null;
  source?: 'shopee' | 'manual' | 'mercadolivre' | 'amazon' | 'other';
  createdBy?: string | null; // 'user' | 'import_shopee' | 'import_file'
  sourceBatchId?: string | null;
  originalUrl?: string | null;
  commissionRate?: number | null;
  sellerCommissionRate?: number | null;
  shopeeCommissionRate?: number | null;
  commission?: number | null;
  ratingStar?: number | null;
  priceDiscountRate?: number | null;
  sales?: number | null;
  shopName?: string | null;
  couponCode?: string | null;
  couponDescription?: string | null;
  couponValue?: string | null;
  couponExpiration?: string | null;
  periodStartTime?: string | null;
  periodEndTime?: string | null;
  subIds?: string[] | null;
  status: 'available' | 'waiting' | 'posted' | 'error';
  lastError?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkConversion {
  id: string;
  batchId?: string | null;
  sourceBatchId?: string | null;
  originalUrl: string;
  affiliateUrl?: string | null;
  productName?: string | null;
  imageUrl?: string | null;
  priceMin?: number | null;
  status: 'converted' | 'duplicate' | 'error' | 'waiting';
  reason?: 'manual_import' | 'batch_import' | 'reconversion';
  subIds?: string[] | null;
  itemId?: string | null;
  shopId?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface WhatsAppGroup {
  id: string;
  provider_group_id: string; // The original @g.us identifier without modification
  groupJid?: string;          // Backward compatibility alias
  name: string;
  picture_url?: string | null;
  imageUrl?: string | null;    // Alias
  participants_count?: number | null;
  participantsCount?: number;  // Alias
  synced_at: string;
  lastSync?: string;           // Alias
  active: boolean;
  updatedAt: string;
}

export interface ConfigurationGroup {
  id: string;
  name: string;
  description?: string | null;
  groupJids: string[]; // List of real WhatsApp group provider_group_ids
  createdAt: string;
  updatedAt: string;
}

export interface Automation {
  id: string;
  name: string;
  type?: 'product' | 'message' | 'recurring_message';
  configurationGroupId?: string | null;
  targetGroups?: string[]; // Specific WhatsApp provider_group_ids
  content?: string | null; // Freeform text message for 'message' and 'recurring_message'
  linkUrl?: string | null; // Optional link
  messageTemplate?: string;
  intervalMinutes: number;
  groupDelaySeconds?: number; // Delay between groups in the same round (0-30s, default 2s)
  productOrder?: 'sequential' | 'random'; // Sequential or Random order (default: random)
  startTime: string; // e.g. "08:00"
  endTime: string;   // e.g. "22:00"
  daysOfWeek?: number[]; // [0, 1, 2, 3, 4, 5, 6]
  timezone: string;  // e.g. "America/Bahia"
  onComplete: 'stop' | 'restart';
  status: 'draft' | 'active' | 'paused' | 'completed' | 'stopped' | 'error';
  currentProductIndex: number;
  currentCycle: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationProduct {
  id: string;
  automationId: string;
  productId: string;
  sortOrder: number;
  status: 'pending' | 'processing' | 'sent' | 'partial' | 'failed';
  lastError?: string | null;
  createdAt: string;
}

export interface MessageJob {
  id: string;
  automationId: string;
  cycleId: number;
  productId?: string | null;
  productName?: string | null;
  whatsappGroupJid: string; // provider_group_id
  provider_group_id?: string;
  groupName: string;
  idempotentKey: string; // automation_id:cycle_id:product_id:whatsapp_group_id
  status: 'pending' | 'processing' | 'sent' | 'failed';
  linkUsed: string;
  subIdUsed?: string | null;
  messageContent: string;
  scheduledFor: string;
  request_started_at?: string | null;
  response_received_at?: string | null;
  provider_message_id?: string | null;
  sentAt?: string | null;
  error?: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  type: 'conversion' | 'dispatch' | 'automation' | 'whatsapp' | 'system' | 'clone';
  description: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface CloneConfig {
  active: boolean;
  sourceGroupJid: string; // WhatsApp group JID to monitor
  sourceGroupName?: string;
  mode: 'manual_approval' | 'auto_automation'; // 'Revisar antes' (default) vs 'Automático'
  targetAutomationId?: string | null; // Selected automation when mode is auto_automation
  subIds?: string[];
  antiLoopHours: number; // e.g. 24 hours
  activatedAt?: string | null;
  lastProcessedTimestamp?: number | null;
  lastProcessedMessageId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CloneItem {
  id: string;
  sourceGroupJid: string;
  sourceGroupName?: string;
  sourceMessageId: string;
  sourceTimestamp: number;
  capturedUrl: string;
  canonicalUrl?: string | null;
  itemId?: string | null;
  shopId?: string | null;
  productName?: string | null;
  currentPrice?: number | null;
  originalPrice?: number | null;
  imageUrl?: string | null;
  generatedAffiliateUrl?: string | null;
  formattedMessage?: string | null;
  status: 'waiting_approval' | 'approved' | 'rejected' | 'auto_added' | 'ignored' | 'error';
  ignoreReason?: string | null;
  error?: string | null;
  productId?: string | null;
  targetAutomationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  admins: Admin[];
  integrations: Integration[];
  products: Product[];
  link_conversions: LinkConversion[];
  whatsapp_groups: WhatsAppGroup[];
  configuration_groups: ConfigurationGroup[];
  automations: Automation[];
  automation_products: AutomationProduct[];
  message_jobs: MessageJob[];
  activity_logs: ActivityLog[];
  clone_config?: CloneConfig;
  clone_items?: CloneItem[];
  settings: Record<string, any>;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getInitialDatabase(): DatabaseSchema {
  // Default admin: admin / admin123
  const defaultAdminHash = bcrypt.hashSync('admin123', 10);
  const now = new Date().toISOString();

  return {
    admins: [
      {
        id: 'admin-1',
        username: 'admin',
        passwordHash: defaultAdminHash,
        createdAt: now,
        updatedAt: now,
      },
    ],
    integrations: [
      {
        id: 'shopee',
        provider: 'shopee',
        credentials: {
          appId: process.env.SHOPEE_APP_ID || '',
          appSecret: process.env.SHOPEE_APP_SECRET || '',
          endpoint: 'https://open-api.affiliate.shopee.com.br/graphql',
        },
        status: 'disconnected',
        lastSync: null,
        updatedAt: now,
      },
      {
        id: 'whatsapp',
        provider: 'whatsapp',
        credentials: {
          endpoint: process.env.WHATSAPP_WORKER_URL || 'http://127.0.0.1:8080',
          apiKey: process.env.WHATSAPP_WORKER_API_KEY || 'OpeNwA',
          sessionId: 'afiliado-auto',
        },
        status: 'disconnected',
        lastSync: null,
        updatedAt: now,
      },
    ],
    products: [],
    link_conversions: [],
    whatsapp_groups: [],
    configuration_groups: [],
    automations: [],
    automation_products: [],
    message_jobs: [],
    activity_logs: [
      {
        id: 'log-init',
        type: 'system',
        description: 'Sistema Afiliado Auto inicializado com sucesso.',
        createdAt: now,
      },
    ],
    clone_config: {
      active: false,
      sourceGroupJid: '',
      sourceGroupName: '',
      mode: 'manual_approval',
      targetAutomationId: null,
      subIds: [],
      antiLoopHours: 24,
      activatedAt: null,
      lastProcessedTimestamp: null,
      lastProcessedMessageId: null,
      createdAt: now,
      updatedAt: now,
    },
    clone_items: [],
    settings: {
      timezone: 'America/Bahia',
      defaultTemplate: `*{{nome}}*

⭐⭐⭐⭐⭐

~De R$ {{preco_anterior}}~

✅ *Por R$ {{preco_atual}}*

🎟️ *CUPOM: {{cupom}}*

{{link}}`,
      autoPreviewLink: true,
    },
  };
}

class DatabaseManager {
  private memoryDb: DatabaseSchema | null = null;

  public read(): DatabaseSchema {
    if (!fs.existsSync(DB_FILE)) {
      const initial = getInitialDatabase();
      this.write(initial);
      return initial;
    }

    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data: DatabaseSchema = JSON.parse(content);
      // Ensure clone structures exist for backward compatibility
      if (!data.clone_config) {
        data.clone_config = {
          active: false,
          sourceGroupJid: '',
          sourceGroupName: '',
          mode: 'manual_approval',
          targetAutomationId: null,
          subIds: [],
          antiLoopHours: 24,
          activatedAt: null,
          lastProcessedTimestamp: null,
          lastProcessedMessageId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      if (!Array.isArray(data.clone_items)) {
        data.clone_items = [];
      }
      this.memoryDb = data;
      return data;
    } catch (e) {
      console.error('Erro ao ler banco de dados. Recuperando estado inicial:', e);
      const initial = getInitialDatabase();
      this.write(initial);
      return initial;
    }
  }

  public write(data: DatabaseSchema): void {
    this.memoryDb = data;
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  public update(updater: (db: DatabaseSchema) => void): DatabaseSchema {
    const db = this.read();
    updater(db);
    this.write(db);
    return db;
  }
}

export const db = new DatabaseManager();

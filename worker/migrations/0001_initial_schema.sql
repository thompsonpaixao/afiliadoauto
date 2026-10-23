-- ==============================================================================
-- AFILIADO AUTO - CLOUDFLARE D1 INITIAL SCHEMA
-- Migration: 0001_initial_schema.sql
-- ==============================================================================

-- 1. Tabela de Administrador Único (Segurança com Hash Bcrypt/WebCrypto)
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Integrações (Shopee, WhatsApp, etc.)
CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    credentials TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'disconnected',
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Produtos Cadastrados e Convertidos
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    item_id TEXT,
    shop_id TEXT,
    product_name TEXT NOT NULL,
    product_link TEXT NOT NULL,
    offer_link TEXT,
    affiliate_link TEXT NOT NULL,
    image_url TEXT,
    price_min REAL NOT NULL DEFAULT 0,
    price_max REAL,
    price_previous REAL, -- NUNCA inventar preço anterior
    commission_rate REAL,
    seller_commission_rate REAL,
    shopee_commission_rate REAL,
    commission REAL,
    rating_star REAL,
    price_discount_rate REAL,
    sales INTEGER,
    shop_name TEXT,
    coupon_code TEXT,
    coupon_description TEXT,
    coupon_value TEXT,
    coupon_expiration TEXT,
    sub_ids TEXT, -- JSON Array: ["sub1", "sub2"]
    status TEXT NOT NULL DEFAULT 'available', -- available, waiting, posted, error
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela de Conversões e Histórico de Links
CREATE TABLE IF NOT EXISTS link_conversions (
    id TEXT PRIMARY KEY,
    batch_id TEXT,
    original_url TEXT NOT NULL,
    affiliate_url TEXT,
    product_name TEXT,
    status TEXT NOT NULL DEFAULT 'waiting', -- converted, duplicate, error, waiting
    sub_ids TEXT, -- JSON Array
    item_id TEXT,
    shop_id TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabela de Grupos Reais do WhatsApp (Sincronizados via OpenWA)
CREATE TABLE IF NOT EXISTS whatsapp_groups (
    id TEXT PRIMARY KEY,
    provider_group_id TEXT UNIQUE NOT NULL, -- Identificador canônico original (sufixo @g.us)
    name TEXT NOT NULL,
    picture_url TEXT,
    participants_count INTEGER DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, -- 1=ativo, 0=inativo (nunca apagado silenciosamente)
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabela de Grupos de Configuração (Agrupamentos Internos de Grupos Reais)
CREATE TABLE IF NOT EXISTS configuration_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Associação de Membros do Grupo de Configuração (Muitos para Muitos)
CREATE TABLE IF NOT EXISTS configuration_group_members (
    id TEXT PRIMARY KEY,
    configuration_group_id TEXT NOT NULL REFERENCES configuration_groups(id) ON DELETE CASCADE,
    provider_group_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabela de Automações
CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    configuration_group_id TEXT NOT NULL REFERENCES configuration_groups(id),
    message_template TEXT NOT NULL,
    interval_minutes INTEGER NOT NULL DEFAULT 15,
    start_time TEXT NOT NULL DEFAULT '08:00',
    end_time TEXT NOT NULL DEFAULT '22:00',
    timezone TEXT NOT NULL DEFAULT 'America/Bahia',
    on_complete TEXT NOT NULL DEFAULT 'stop', -- stop, restart
    status TEXT NOT NULL DEFAULT 'active', -- active, paused, stopped, completed
    current_product_index INTEGER NOT NULL DEFAULT 0,
    current_cycle INTEGER NOT NULL DEFAULT 1,
    last_run_at DATETIME,
    next_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Produtos na Fila da Automação (Preserva a Ordem Exata)
CREATE TABLE IF NOT EXISTS automation_products (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'waiting', -- waiting, preparing, sending, sent, error
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Ciclos de Disparo da Automação
CREATE TABLE IF NOT EXISTS automation_cycles (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    cycle_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- 11. Jobs de Mensagens e Disparos Individuais por Grupo
CREATE TABLE IF NOT EXISTS message_jobs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL,
    cycle_id INTEGER NOT NULL DEFAULT 1,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    provider_group_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    idempotent_key TEXT UNIQUE NOT NULL, -- automation_id:cycle_id:product_id:provider_group_id
    status TEXT NOT NULL DEFAULT 'pending', -- sent, error, pending, offline_retry
    link_used TEXT NOT NULL,
    sub_id_used TEXT,
    message_content TEXT NOT NULL,
    scheduled_for DATETIME NOT NULL,
    request_started_at DATETIME,
    response_received_at DATETIME,
    provider_message_id TEXT,
    sent_at DATETIME,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Histórico de Tentativas de Disparo (Auditoria e Retries)
CREATE TABLE IF NOT EXISTS message_attempts (
    id TEXT PRIMARY KEY,
    message_job_id TEXT NOT NULL REFERENCES message_jobs(id) ON DELETE CASCADE,
    provider_group_id TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. Tabela de Configurações do Sistema
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Logs de Atividades Operacionais
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- conversion, dispatch, automation, whatsapp, system
    description TEXT NOT NULL,
    metadata TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Lotes de Importação Assíncrona (Cloudflare Queues)
CREATE TABLE IF NOT EXISTS batch_imports (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, partial, failed
    total_links INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    converted_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices essenciais para consultas de alta performance
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_product_link ON products(product_link);
CREATE INDEX IF NOT EXISTS idx_message_jobs_idempotent ON message_jobs(idempotent_key);
CREATE INDEX IF NOT EXISTS idx_message_jobs_status ON message_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);
CREATE INDEX IF NOT EXISTS idx_automation_products_auto ON automation_products(automation_id, sort_order);

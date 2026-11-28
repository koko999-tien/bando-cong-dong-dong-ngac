-- VN Resilience Atlas — Cloudflare D1 Normalized Schema (vn-resilience-db)
CREATE TABLE IF NOT EXISTS platform_collections (
  collection_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sos_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  organization TEXT DEFAULT '',
  auth_provider TEXT NOT NULL DEFAULT 'local',
  trust_tier TEXT NOT NULL DEFAULT 'citizen',
  status TEXT NOT NULL DEFAULT 'active',
  ekyc_json TEXT,
  completed_helps INTEGER NOT NULL DEFAULT 0,
  abuse_flags INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_d1_sos_acc_email ON sos_accounts(email);
CREATE INDEX IF NOT EXISTS idx_d1_sos_acc_tier ON sos_accounts(trust_tier, status);

CREATE TABLE IF NOT EXISTS sos_tickets (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT NOT NULL,
  dispatch_scope TEXT NOT NULL,
  max_responders INTEGER NOT NULL DEFAULT 2,
  geohash6 TEXT NOT NULL,
  fuzzy_lat REAL,
  fuzzy_lng REAL,
  exact_lat REAL,
  exact_lng REAL,
  exact_coord_shredded INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_d1_sos_ticket_gh ON sos_tickets(geohash6, status);

CREATE TABLE IF NOT EXISTS sos_ephemeral_cells (
  responder_id TEXT PRIMARY KEY,
  geohash5 TEXT NOT NULL,
  trust_tier TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_d1_cells_gh5 ON sos_ephemeral_cells(geohash5, expires_at_ms);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  sub_hash TEXT PRIMARY KEY,
  responder_id TEXT NOT NULL,
  geohash5 TEXT NOT NULL,
  subscription_json TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_d1_push_gh5 ON push_subscriptions(geohash5, expires_at_ms);

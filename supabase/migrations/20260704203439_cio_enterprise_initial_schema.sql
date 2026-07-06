/*
# CIO Enterprise — Initial Schema

## Summary
Creates all tables required for the CIO Enterprise operational intelligence system.
This is a single-tenant application (no login/users), so all policies grant access
to both `anon` and `authenticated` roles using USING(true) / WITH CHECK(true).

## Tables

### system_config
Key-value store for all system configuration: API tokens, endpoints, sync frequencies,
and any other configurable setting. Replaces hardcoded values so the system works
entirely from Admin-screen settings.

### sync_logs
Complete log of every integration operation: syncs, corrections, API calls, errors.
Used by the Integrate and Admin screens for audit trails. Stores source system,
operation name, status, duration, and a JSONB details blob.

### divergences
Snapshot of current divergences detected between Bling (ERP, source of truth) and
the marketplaces (Mercado Livre, Shopee). Stores ERP value, marketplace values,
divergence type (stock, title, status, etc.), priority level, recommended action,
and resolved/ignored state.

### audit_records
High-level operational audit history displayed on the Dashboard and Monitor screens.
Records module, human-readable description, outcome, and optional JSONB details.

## Security
RLS is enabled on all tables. Because this is a no-auth system (accessed directly
via the app URL with no login), all policies target `anon, authenticated` with
USING(true) / WITH CHECK(true) so the anon-key frontend can read and write freely.
*/

-- ─── system_config ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  key   text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc_select" ON system_config;
CREATE POLICY "sc_select" ON system_config FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "sc_insert" ON system_config;
CREATE POLICY "sc_insert" ON system_config FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sc_update" ON system_config;
CREATE POLICY "sc_update" ON system_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sc_delete" ON system_config;
CREATE POLICY "sc_delete" ON system_config FOR DELETE TO anon, authenticated USING (true);

-- ─── sync_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz DEFAULT now(),
  source       text NOT NULL,            -- 'bling' | 'mercadolivre' | 'shopee' | 'system'
  operation    text NOT NULL,            -- e.g. 'sync_stock', 'fix_divergence', 'conciliar_todos'
  status       text NOT NULL,            -- 'success' | 'error' | 'partial'
  duration_ms  integer,
  details      jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sync_logs_created_at_idx ON sync_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS sync_logs_source_idx ON sync_logs (source);
CREATE INDEX IF NOT EXISTS sync_logs_status_idx ON sync_logs (status);

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sl_select" ON sync_logs;
CREATE POLICY "sl_select" ON sync_logs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "sl_insert" ON sync_logs;
CREATE POLICY "sl_insert" ON sync_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sl_update" ON sync_logs;
CREATE POLICY "sl_update" ON sync_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sl_delete" ON sync_logs;
CREATE POLICY "sl_delete" ON sync_logs FOR DELETE TO anon, authenticated USING (true);

-- ─── divergences ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS divergences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  product_name        text NOT NULL,
  sku                 text NOT NULL,
  divergence_type     text NOT NULL,   -- 'stock' | 'title' | 'status' | 'photo' | 'description' | 'price' | 'orphan'
  priority            text NOT NULL,   -- 'critical' | 'high' | 'medium' | 'informative'
  erp_value           text,
  ml_value            text,
  shopee_value        text,
  recommended_action  text NOT NULL,
  marketplace         text NOT NULL,  -- 'mercadolivre' | 'shopee' | 'both'
  ml_item_id          text,
  shopee_item_id      text,
  resolved            boolean NOT NULL DEFAULT false,
  resolved_at         timestamptz,
  ignored             boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS div_resolved_idx ON divergences (resolved, ignored);
CREATE INDEX IF NOT EXISTS div_priority_idx ON divergences (priority);
CREATE INDEX IF NOT EXISTS div_sku_idx ON divergences (sku);

ALTER TABLE divergences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "div_select" ON divergences;
CREATE POLICY "div_select" ON divergences FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "div_insert" ON divergences;
CREATE POLICY "div_insert" ON divergences FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "div_update" ON divergences;
CREATE POLICY "div_update" ON divergences FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "div_delete" ON divergences;
CREATE POLICY "div_delete" ON divergences FOR DELETE TO anon, authenticated USING (true);

-- ─── audit_records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  module      text NOT NULL,   -- 'dashboard' | 'monitor' | 'conciliacao' | 'integrar' | 'sistema'
  description text NOT NULL,
  result      text NOT NULL,   -- 'success' | 'error' | 'partial' | 'info'
  details     jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ar_created_at_idx ON audit_records (created_at DESC);
CREATE INDEX IF NOT EXISTS ar_module_idx ON audit_records (module);

ALTER TABLE audit_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ar_select" ON audit_records;
CREATE POLICY "ar_select" ON audit_records FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ar_insert" ON audit_records;
CREATE POLICY "ar_insert" ON audit_records FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ar_update" ON audit_records;
CREATE POLICY "ar_update" ON audit_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ar_delete" ON audit_records;
CREATE POLICY "ar_delete" ON audit_records FOR DELETE TO anon, authenticated USING (true);

-- ─── Seed default config keys ─────────────────────────────────────────────────
INSERT INTO system_config (key, value) VALUES
  ('bling_token',            ''),
  ('bling_endpoint',         'https://www.bling.com.br/Api/v3'),
  ('bling_sync_frequency',   '15'),
  ('ml_token',               ''),
  ('ml_store_id',            ''),
  ('shopee_token',           ''),
  ('shopee_store_id',        ''),
  ('audit_frequency',        '30'),
  ('conciliation_auto',      'false'),
  ('conciliation_frequency', '60'),
  ('export_format',          'csv')
ON CONFLICT (key) DO NOTHING;

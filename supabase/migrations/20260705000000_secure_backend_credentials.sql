/*
# CIO Enterprise — Secure Backend Credentials & Access Control

## Motivo
A auditoria técnica encontrou uma falha crítica de segurança: os tokens das
integrações (Bling, Mercado Livre, Shopee) estavam guardados em `system_config`,
uma tabela com RLS liberado para a role `anon` — ou seja, qualquer pessoa que
abrisse o DevTools no navegador conseguia ler os tokens em texto puro.

Esta migration:
1. Cria `oauth_credentials` e `oauth_tokens`, tabelas SEM NENHUMA policy de RLS
   para `anon`/`authenticated`. Só o `service_role` (usado exclusivamente pelas
   Edge Functions, nunca pelo navegador) consegue ler/escrever nelas.
2. Remove do `system_config` todas as chaves sensíveis (tokens, endpoints,
   ids de loja), que passam a existir apenas nas tabelas seguras acima.
3. Restringe INSERT/UPDATE/DELETE em `sync_logs`, `divergences` e
   `audit_records` para `service_role` apenas — o frontend continua podendo
   LER (para os dashboards), mas só as Edge Functions podem escrever,
   impedindo que alguém forje logs ou auditorias direto pelo navegador.
*/

-- ─── oauth_credentials (Client ID / Secret / Partner Key — nunca expostos ao browser) ───
CREATE TABLE IF NOT EXISTS oauth_credentials (
  source        text PRIMARY KEY,        -- 'bling' | 'mercadolivre' | 'shopee'
  client_id     text,
  client_secret text,
  redirect_uri  text,
  extra         jsonb DEFAULT '{}'::jsonb,
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE oauth_credentials ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy criada de propósito: anon/authenticated não têm NENHUM acesso.
-- Apenas o service_role (Edge Functions) contorna RLS por padrão no Postgres/Supabase.

-- ─── oauth_tokens (Access/Refresh Token de cada integração) ─────────────────
CREATE TABLE IF NOT EXISTS oauth_tokens (
  source        text PRIMARY KEY,        -- 'bling' | 'mercadolivre' | 'shopee'
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  shop_id       text,                    -- Shopee shop_id / ML user_id (seller)
  scope         text,
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Idem: sem policies para anon/authenticated.

-- ─── Remover dados sensíveis do system_config (segue existindo só p/ config não-sensível) ───
DELETE FROM system_config WHERE key IN (
  'bling_token', 'bling_endpoint', 'bling_sync_frequency',
  'ml_token', 'ml_store_id',
  'shopee_token', 'shopee_store_id'
);

INSERT INTO oauth_credentials (source) VALUES ('bling'), ('mercadolivre'), ('shopee')
ON CONFLICT (source) DO NOTHING;

INSERT INTO oauth_tokens (source) VALUES ('bling'), ('mercadolivre'), ('shopee')
ON CONFLICT (source) DO NOTHING;

-- ─── Travar escrita em sync_logs / divergences / audit_records para service_role ───
DROP POLICY IF EXISTS "sl_insert" ON sync_logs;
DROP POLICY IF EXISTS "sl_update" ON sync_logs;
DROP POLICY IF EXISTS "sl_delete" ON sync_logs;

DROP POLICY IF EXISTS "div_insert" ON divergences;
DROP POLICY IF EXISTS "div_update" ON divergences;
DROP POLICY IF EXISTS "div_delete" ON divergences;

DROP POLICY IF EXISTS "ar_insert" ON audit_records;
DROP POLICY IF EXISTS "ar_update" ON audit_records;
DROP POLICY IF EXISTS "ar_delete" ON audit_records;
-- SELECT continua liberado para anon/authenticated (sc_select, sl_select, div_select, ar_select
-- já existentes na migration inicial) — o frontend só passa a poder LER, nunca escrever direto.

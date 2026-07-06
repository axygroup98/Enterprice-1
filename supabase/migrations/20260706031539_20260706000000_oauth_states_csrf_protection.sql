/*
# CIO Enterprise — OAuth State / CSRF Protection

Adds oauth_states table to store short-lived CSRF tokens generated during
OAuth flows (bling-oauth-start, ml-oauth-start, shopee-oauth-start).
Each callback validates the returned `state` against this table before
proceeding with the token exchange, preventing CSRF attacks.

Rows are auto-expired by the app (TTL enforced in the Edge Function).
RLS: no anon/authenticated policies — only service_role can read/write.
*/

CREATE TABLE IF NOT EXISTS oauth_states (
  state       text PRIMARY KEY,
  source      text NOT NULL,              -- 'bling' | 'mercadolivre' | 'shopee'
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz NOT NULL        -- 10 minutes from creation
);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: only service_role (Edge Functions) may access.

CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at);

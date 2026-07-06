import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

export interface OAuthCredentials {
  source: string;
  client_id: string | null;
  client_secret: string | null;
  redirect_uri: string | null;
  extra: Record<string, unknown>;
}

export interface OAuthTokens {
  source: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  shop_id: string | null;
  scope: string | null;
}

export async function getCredentials(source: string): Promise<OAuthCredentials | null> {
  const db = serviceClient();
  const { data } = await db.from('oauth_credentials').select('*').eq('source', source).maybeSingle();
  return data as OAuthCredentials | null;
}

export async function getTokens(source: string): Promise<OAuthTokens | null> {
  const db = serviceClient();
  const { data } = await db.from('oauth_tokens').select('*').eq('source', source).maybeSingle();
  return data as OAuthTokens | null;
}

export async function saveTokens(source: string, fields: Partial<OAuthTokens>): Promise<void> {
  const db = serviceClient();
  await db.from('oauth_tokens').upsert(
    { source, ...fields, updated_at: new Date().toISOString() },
    { onConflict: 'source' }
  );
}

// ─── OAuth state / CSRF ──────────────────────────────────────────────────────

export async function storeOAuthState(state: string, source: string): Promise<void> {
  const db = serviceClient();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min TTL
  await db.from('oauth_states').insert({ state, source, expires_at: expiresAt });
}

export async function consumeOAuthState(state: string, source: string): Promise<boolean> {
  if (!state) return false;
  const db = serviceClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from('oauth_states')
    .select('state, source, expires_at')
    .eq('state', state)
    .eq('source', source)
    .gt('expires_at', now)
    .maybeSingle();
  if (!data) return false;
  // Consume (delete) the state token — one-time use
  await db.from('oauth_states').delete().eq('state', state);
  // Cleanup expired states opportunistically
  await db.from('oauth_states').delete().lt('expires_at', now);
  return true;
}

export async function insertSyncLog(entry: {
  source: string;
  operation: string;
  status: 'success' | 'error' | 'partial';
  duration_ms?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = serviceClient();
  await db.from('sync_logs').insert({
    source: entry.source,
    operation: entry.operation,
    status: entry.status,
    duration_ms: entry.duration_ms ?? null,
    details: entry.details ?? {},
  });
}

export async function insertAuditRecord(entry: {
  module: string;
  description: string;
  result: 'success' | 'error' | 'partial' | 'info';
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = serviceClient();
  await db.from('audit_records').insert({
    module: entry.module,
    description: entry.description,
    result: entry.result,
    details: entry.details ?? {},
  });
}

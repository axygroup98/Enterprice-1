import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';

const SOURCES = ['bling', 'mercadolivre', 'shopee'] as const;

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const db = serviceClient();
  const { data: creds } = await db.from('oauth_credentials').select('source, client_id, redirect_uri');
  const { data: tokens } = await db.from('oauth_tokens').select('source, access_token, expires_at');
  const { data: recentLogs } = await db
    .from('sync_logs')
    .select('source, status, created_at, duration_ms')
    .order('created_at', { ascending: false })
    .limit(60);

  const result = SOURCES.map((source) => {
    const cred = creds?.find((c) => c.source === source);
    const token = tokens?.find((t) => t.source === source);
    const logs = recentLogs?.filter((l) => l.source === source) ?? [];
    const lastSuccess = logs.find((l) => l.status === 'success');
    const errorCount = logs.filter((l) => l.status === 'error').length;
    const durationLogs = logs.filter((l) => l.duration_ms != null);
    const avgMs = durationLogs.length
      ? Math.round(durationLogs.reduce((s, l) => s + (l.duration_ms ?? 0), 0) / durationLogs.length)
      : null;

    const configured = Boolean(cred?.client_id);
    const connected = Boolean(token?.access_token);
    const expiresAt = token?.expires_at ? new Date(token.expires_at).getTime() : 0;
    const tokenValid = connected && expiresAt > Date.now();

    return {
      source,
      configured,
      connected,
      tokenValid,
      lastSync: lastSuccess?.created_at ?? null,
      responseMs: avgMs,
      errorCount,
    };
  });

  return jsonResponse({ ok: true, data: result });
});

import { handleOptions } from '../_shared/cors.ts';
import { getCredentials, saveTokens, insertAuditRecord } from '../_shared/db.ts';
import { httpRequest } from '../_shared/http-client.ts';

// POST https://api.mercadolibre.com/oauth/token com grant_type=authorization_code
// (developers.mercadolivre.com.br) — client_secret nunca sai do servidor.
Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');

  const creds = await getCredentials('mercadolivre');
  const backTo = (creds?.extra as Record<string, unknown> | null)?.frontend_admin_url as string | undefined;
  const redirectBase = backTo || '/';

  if (errorParam || !code) {
    await insertAuditRecord({ module: 'integrar', description: 'Falha na autorização OAuth do Mercado Livre', result: 'error', details: { error: errorParam } });
    return Response.redirect(`${redirectBase}?ml=error&reason=${encodeURIComponent(errorParam || 'code_ausente')}`, 302);
  }

  if (!creds?.client_id || !creds?.client_secret || !creds?.redirect_uri) {
    return Response.redirect(`${redirectBase}?ml=error&reason=credenciais_nao_configuradas`, 302);
  }

  const result = await httpRequest<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
  }>('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      code,
      redirect_uri: creds.redirect_uri,
    }).toString(),
    source: 'mercadolivre',
    operation: 'oauth_exchange',
  });

  if (!result.ok || !result.data?.access_token) {
    await insertAuditRecord({ module: 'integrar', description: 'Falha ao trocar code por token no Mercado Livre', result: 'error', details: { error: result.error, response: result.data } });
    return Response.redirect(`${redirectBase}?ml=error&reason=troca_token_falhou`, 302);
  }

  await saveTokens('mercadolivre', {
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at: new Date(Date.now() + result.data.expires_in * 1000).toISOString(),
    shop_id: String(result.data.user_id),
  });

  await insertAuditRecord({ module: 'integrar', description: 'Mercado Livre conectado com sucesso via OAuth', result: 'success', details: { user_id: result.data.user_id } });

  return Response.redirect(`${redirectBase}?ml=connected`, 302);
});

import { handleOptions } from '../_shared/cors.ts';
import { getCredentials, saveTokens, insertAuditRecord, consumeOAuthState } from '../_shared/db.ts';
import { httpRequest } from '../_shared/http-client.ts';

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const creds = await getCredentials('bling');
  const backTo = (creds?.extra as Record<string, unknown> | null)?.frontend_admin_url as string | undefined;
  const redirectBase = backTo || '/';

  if (errorParam || !code) {
    await insertAuditRecord({
      module: 'integrar',
      description: 'Falha na autorização OAuth do Bling',
      result: 'error',
      details: { error: errorParam || 'code ausente' },
    });
    return Response.redirect(
      `${redirectBase}?bling=error&reason=${encodeURIComponent(errorParam || 'code_ausente')}`,
      302
    );
  }

  // CSRF: validate state token
  const stateValid = state ? await consumeOAuthState(state, 'bling') : false;
  if (!stateValid) {
    await insertAuditRecord({
      module: 'integrar',
      description: 'OAuth Bling rejeitado: state inválido ou expirado (possível CSRF)',
      result: 'error',
      details: { state },
    });
    return Response.redirect(`${redirectBase}?bling=error&reason=state_invalido`, 302);
  }

  if (!creds?.client_id || !creds?.client_secret) {
    return Response.redirect(`${redirectBase}?bling=error&reason=credenciais_nao_configuradas`, 302);
  }

  const basic = btoa(`${creds.client_id}:${creds.client_secret}`);
  const result = await httpRequest<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>('https://api.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
      Authorization: `Basic ${basic}`,
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(code)}`,
    source: 'bling',
    operation: 'oauth_exchange',
  });

  if (!result.ok || !result.data?.access_token) {
    await insertAuditRecord({
      module: 'integrar',
      description: 'Falha ao trocar authorization_code por token no Bling',
      result: 'error',
      details: { error: result.error, response: result.data },
    });
    return Response.redirect(`${redirectBase}?bling=error&reason=troca_token_falhou`, 302);
  }

  const expiresAt = new Date(Date.now() + result.data.expires_in * 1000).toISOString();
  await saveTokens('bling', {
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at: expiresAt,
  });

  await insertAuditRecord({
    module: 'integrar',
    description: 'Bling conectado com sucesso via OAuth',
    result: 'success',
    details: { expires_at: expiresAt },
  });

  return Response.redirect(`${redirectBase}?bling=connected`, 302);
});

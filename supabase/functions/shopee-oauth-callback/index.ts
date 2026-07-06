import { handleOptions } from '../_shared/cors.ts';
import { getCredentials, saveTokens, insertAuditRecord } from '../_shared/db.ts';
import { httpRequest } from '../_shared/http-client.ts';
import { hmacSha256Hex } from '../_shared/shopee-sign.ts';

const HOST = 'https://partner.shopeemobile.com';

// Endpoint oficial /api/v2/auth/access_token/get, usado tanto para trocar o
// code quanto para renovar via refresh_token. Assinatura para endpoints de
// auth: sign = HMAC-SHA256(partner_key, partner_id + path + timestamp).
Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const shopId = url.searchParams.get('shop_id');

  const creds = await getCredentials('shopee');
  const backTo = (creds?.extra as Record<string, unknown> | null)?.frontend_admin_url as string | undefined;
  const redirectBase = backTo || '/';

  if (!code || !shopId) {
    await insertAuditRecord({ module: 'integrar', description: 'Falha na autorização OAuth da Shopee (code/shop_id ausente)', result: 'error' });
    return Response.redirect(`${redirectBase}?shopee=error&reason=code_ou_shop_ausente`, 302);
  }

  if (!creds?.client_id || !creds?.client_secret) {
    return Response.redirect(`${redirectBase}?shopee=error&reason=credenciais_nao_configuradas`, 302);
  }

  const path = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${creds.client_id}${path}${timestamp}`;
  const sign = await hmacSha256Hex(creds.client_secret, baseString);

  const result = await httpRequest<{ access_token: string; refresh_token: string; expire_in: number }>(
    `${HOST}${path}?partner_id=${creds.client_id}&timestamp=${timestamp}&sign=${sign}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(creds.client_id) }),
      source: 'shopee',
      operation: 'oauth_exchange',
    }
  );

  if (!result.ok || !result.data?.access_token) {
    await insertAuditRecord({ module: 'integrar', description: 'Falha ao trocar code por token na Shopee', result: 'error', details: { error: result.error, response: result.data } });
    return Response.redirect(`${redirectBase}?shopee=error&reason=troca_token_falhou`, 302);
  }

  await saveTokens('shopee', {
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at: new Date(Date.now() + result.data.expire_in * 1000).toISOString(),
    shop_id: shopId,
  });

  await insertAuditRecord({ module: 'integrar', description: 'Shopee conectada com sucesso via OAuth', result: 'success', details: { shop_id: shopId } });

  return Response.redirect(`${redirectBase}?shopee=connected`, 302);
});

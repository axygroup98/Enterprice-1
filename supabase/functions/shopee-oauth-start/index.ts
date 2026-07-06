import { corsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCredentials } from '../_shared/db.ts';
import { hmacSha256Hex } from '../_shared/shopee-sign.ts';

const HOST = 'https://partner.shopeemobile.com';

// Fluxo oficial de autorização de loja da Shopee Open Platform v2:
// GET /api/v2/shop/auth_partner?partner_id=...&redirect=...&timestamp=...&sign=...
// sign = HMAC-SHA256(partner_key, partner_id + path + timestamp)
Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const creds = await getCredentials('shopee');
  const extra = (creds?.extra ?? {}) as Record<string, string>;
  if (!creds?.client_id || !creds?.client_secret || !creds?.redirect_uri) {
    return jsonResponse({ error: 'Integração não configurada. Cadastre Partner ID, Partner Key e Redirect URI da Shopee em Administrar.' }, 400);
  }

  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${creds.client_id}${path}${timestamp}`;
  const sign = await hmacSha256Hex(creds.client_secret, baseString);

  const authorizeUrl = new URL(`${HOST}${path}`);
  authorizeUrl.searchParams.set('partner_id', creds.client_id);
  authorizeUrl.searchParams.set('redirect', creds.redirect_uri);
  authorizeUrl.searchParams.set('timestamp', String(timestamp));
  authorizeUrl.searchParams.set('sign', sign);
  void extra;

  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: authorizeUrl.toString() } });
});

import { corsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCredentials, storeOAuthState } from '../_shared/db.ts';
import { hmacSha256Hex } from '../_shared/shopee-sign.ts';

const HOST = 'https://partner.shopeemobile.com';

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const creds = await getCredentials('shopee');
  if (!creds?.client_id || !creds?.client_secret || !creds?.redirect_uri) {
    return jsonResponse(
      { error: 'Integração não configurada. Cadastre Partner ID, Partner Key e Redirect URI da Shopee em Administrar.' },
      400
    );
  }

  const state = crypto.randomUUID();
  await storeOAuthState(state, 'shopee');

  // Shopee does not relay an arbitrary `state` param through their OAuth redirect.
  // The standard workaround is to append the state to the redirect_uri so Shopee
  // echoes it back as part of the callback URL query string.
  const redirectWithState = `${creds.redirect_uri}${creds.redirect_uri.includes('?') ? '&' : '?'}state=${state}`;

  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${creds.client_id}${path}${timestamp}`;
  const sign = await hmacSha256Hex(creds.client_secret, baseString);

  const authorizeUrl = new URL(`${HOST}${path}`);
  authorizeUrl.searchParams.set('partner_id', creds.client_id);
  authorizeUrl.searchParams.set('redirect', redirectWithState);
  authorizeUrl.searchParams.set('timestamp', String(timestamp));
  authorizeUrl.searchParams.set('sign', sign);

  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: authorizeUrl.toString() },
  });
});

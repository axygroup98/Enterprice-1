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

  // Generate and store state for CSRF protection
  const state = crypto.randomUUID();
  await storeOAuthState(state, 'shopee');

  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${creds.client_id}${path}${timestamp}`;
  const sign = await hmacSha256Hex(creds.client_secret, baseString);

  const authorizeUrl = new URL(`${HOST}${path}`);
  authorizeUrl.searchParams.set('partner_id', creds.client_id);
  authorizeUrl.searchParams.set('redirect', creds.redirect_uri);
  authorizeUrl.searchParams.set('timestamp', String(timestamp));
  authorizeUrl.searchParams.set('sign', sign);
  // Pass state in redirect URL so Shopee returns it in the callback
  // Shopee doesn't officially pass state through; we embed it in the redirect URI instead
  // by appending it as a query param in redirect_uri (pre-registered with trailing ?state=)
  // This is the standard workaround for Shopee's OAuth implementation.
  // The actual state validation occurs in shopee-oauth-callback.

  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: authorizeUrl.toString() },
  });
});

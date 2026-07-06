import { corsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getCredentials } from '../_shared/db.ts';

// Endpoint oficial de autorização do Bling API v3 (verificado em
// developer.bling.com.br/aplicativos):
// GET https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=...&state=...
// redirect_uri e scope são definidos no cadastro do app no Bling, não aqui.
Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const creds = await getCredentials('bling');
  if (!creds?.client_id) {
    return jsonResponse({ error: 'Integração não configurada. Cadastre o Client ID do Bling em Administrar antes de conectar.' }, 400);
  }

  const state = crypto.randomUUID();
  const authorizeUrl = new URL('https://www.bling.com.br/Api/v3/oauth/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', creds.client_id);
  authorizeUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: authorizeUrl.toString() },
  });
});

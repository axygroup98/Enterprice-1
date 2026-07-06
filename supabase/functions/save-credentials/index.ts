import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';

// Único ponto de escrita para oauth_credentials. O frontend nunca escreve
// direto na tabela (ela não tem policy de RLS para anon/authenticated),
// então toda gravação de Client ID/Secret passa obrigatoriamente por aqui.
// Isto também significa que o valor do secret nunca fica visível de volta
// para o navegador depois de salvo (o GET de status só informa se está
// configurado, não o valor).
Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido' }, 405);

  let body: {
    source: 'bling' | 'mercadolivre' | 'shopee';
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
    frontend_admin_url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo inválido' }, 400);
  }

  if (!['bling', 'mercadolivre', 'shopee'].includes(body.source)) {
    return jsonResponse({ error: 'source inválido' }, 400);
  }

  const db = serviceClient();
  const { data: existing } = await db.from('oauth_credentials').select('extra').eq('source', body.source).maybeSingle();
  const extra = { ...(existing?.extra ?? {}), frontend_admin_url: body.frontend_admin_url };

  const update: Record<string, unknown> = { source: body.source, extra, updated_at: new Date().toISOString() };
  if (body.client_id !== undefined) update.client_id = body.client_id;
  if (body.client_secret !== undefined) update.client_secret = body.client_secret;
  if (body.redirect_uri !== undefined) update.redirect_uri = body.redirect_uri;

  const { error } = await db.from('oauth_credentials').upsert(update, { onConflict: 'source' });
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  return jsonResponse({ ok: true });
});

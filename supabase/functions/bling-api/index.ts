import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { refreshIfNeeded, testConnection, getProducts } from '../_shared/bling.ts';
import { httpRequest } from '../_shared/http-client.ts';

const API_BASE = 'https://api.bling.com.br/Api/v3';

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let action = '';
  try {
    const body = await req.json();
    action = body.action;
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido' }, 400);
  }

  if (action === 'test_connection') {
    const result = await testConnection();
    return jsonResponse(result);
  }

  if (action === 'get_products') {
    const result = await getProducts();
    return jsonResponse(result);
  }

  if (action === 'get_orders') {
    const auth = await refreshIfNeeded();
    if ('error' in auth) return jsonResponse({ ok: false, error: auth.error, notConfigured: true });
    const result = await httpRequest<{ data: Array<Record<string, unknown>> }>(
      `${API_BASE}/pedidos/vendas?limite=100`,
      { headers: { Authorization: `Bearer ${auth.token}` }, source: 'bling', operation: 'get_orders' }
    );
    if (!result.ok) return jsonResponse({ ok: false, error: result.error });
    return jsonResponse({ ok: true, data: result.data?.data ?? [] });
  }

  return jsonResponse({ ok: false, error: `Ação desconhecida: ${action}` }, 400);
});

import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { testConnection, getProducts, getOrders } from '../_shared/bling.ts';

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

  if (action === 'test_connection') return jsonResponse(await testConnection());
  if (action === 'get_products') return jsonResponse(await getProducts());
  if (action === 'get_orders') return jsonResponse(await getOrders());

  return jsonResponse({ ok: false, error: `Ação desconhecida: ${action}` }, 400);
});

import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { testConnection, getListings, updateStock, closeListing, reactivateListing } from '../_shared/ml.ts';

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let action = '';
  let params: Record<string, unknown> = {};
  try {
    const body = await req.json();
    action = body.action;
    params = body.params ?? {};
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido' }, 400);
  }

  if (action === 'test_connection') return jsonResponse(await testConnection());
  if (action === 'get_listings') return jsonResponse(await getListings());

  if (action === 'update_stock') {
    const { itemId, quantity } = params as { itemId: string; quantity: number };
    return jsonResponse(await updateStock(itemId, quantity));
  }

  if (action === 'close_listing') {
    const { itemId } = params as { itemId: string };
    return jsonResponse(await closeListing(itemId));
  }

  if (action === 'reactivate_listing') {
    const { itemId } = params as { itemId: string };
    return jsonResponse(await reactivateListing(itemId));
  }

  return jsonResponse({ ok: false, error: `Ação desconhecida: ${action}` }, 400);
});

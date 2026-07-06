import { getCredentials, getTokens, saveTokens } from './db.ts';
import { httpRequest } from './http-client.ts';

const API_BASE = 'https://api.mercadolibre.com';

export interface MLListing {
  itemId: string;
  sku: string;
  title: string;
  stock: number;
  status: 'active' | 'paused' | 'closed';
}

export type AuthResult = { token: string; sellerId: string } | { error: string };

export async function refreshIfNeeded(): Promise<AuthResult> {
  const tokens = await getTokens('mercadolivre');
  if (!tokens?.access_token) return { error: 'Integração não configurada.' };

  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return { token: tokens.access_token, sellerId: tokens.shop_id ?? '' };

  if (!tokens.refresh_token) return { error: 'Token do Mercado Livre expirado e sem refresh_token. Refaça a conexão OAuth.' };
  const creds = await getCredentials('mercadolivre');
  if (!creds?.client_id || !creds?.client_secret) return { error: 'Credenciais do Mercado Livre não configuradas.' };

  const result = await httpRequest<{ access_token: string; refresh_token: string; expires_in: number; user_id: number }>(
    `${API_BASE}/oauth/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: tokens.refresh_token,
      }).toString(),
      source: 'mercadolivre',
      operation: 'oauth_refresh',
    }
  );

  if (!result.ok || !result.data?.access_token) {
    return { error: `Falha ao renovar token do Mercado Livre: ${result.error ?? 'resposta inválida'}` };
  }

  await saveTokens('mercadolivre', {
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at: new Date(Date.now() + result.data.expires_in * 1000).toISOString(),
    shop_id: String(result.data.user_id),
  });

  return { token: result.data.access_token, sellerId: String(result.data.user_id) };
}

export async function testConnection(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, ms: 0, error: auth.error };
  const result = await httpRequest(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${auth.token}` }, source: 'mercadolivre', operation: 'test_connection' });
  return { ok: result.ok, ms: result.ms, error: result.error };
}

export async function getListings(): Promise<{ ok: true; data: MLListing[] } | { ok: false; error: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, error: auth.error };
  const headers = { Authorization: `Bearer ${auth.token}` };

  const searchRes = await httpRequest<{ results: string[] }>(
    `${API_BASE}/users/${auth.sellerId}/items/search?limit=100`,
    { headers, source: 'mercadolivre', operation: 'get_listings' }
  );
  if (!searchRes.ok) return { ok: false, error: searchRes.error ?? 'erro desconhecido' };
  const ids = searchRes.data?.results ?? [];
  if (!ids.length) return { ok: true, data: [] };

  const detailRes = await httpRequest<Array<{ body: Record<string, unknown> }>>(
    `${API_BASE}/items?ids=${ids.slice(0, 20).join(',')}`,
    { headers, source: 'mercadolivre', operation: 'get_listings_detail' }
  );
  if (!detailRes.ok) return { ok: false, error: detailRes.error ?? 'erro desconhecido' };

  const listings: MLListing[] = (detailRes.data ?? []).map(({ body: b }) => {
    const attrs = (b.attributes as Array<{ id: string; value_name: string }>) ?? [];
    const skuAttr = attrs.find((a) => a.id === 'SELLER_SKU');
    return {
      itemId: String(b.id ?? ''),
      sku: skuAttr?.value_name ?? String(b.id ?? ''),
      title: String(b.title ?? ''),
      stock: Number(b.available_quantity ?? 0),
      status: String(b.status ?? 'closed') as MLListing['status'],
    };
  });
  return { ok: true, data: listings };
}

export async function updateStock(itemId: string, quantity: number): Promise<{ ok: boolean; error?: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, error: auth.error };
  const result = await httpRequest(`${API_BASE}/items/${itemId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ available_quantity: quantity }),
    source: 'mercadolivre',
    operation: 'update_stock',
  });
  return { ok: result.ok, error: result.error };
}

export async function closeListing(itemId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, error: auth.error };
  const result = await httpRequest(`${API_BASE}/items/${itemId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'closed' }),
    source: 'mercadolivre',
    operation: 'close_listing',
  });
  return { ok: result.ok, error: result.error };
}

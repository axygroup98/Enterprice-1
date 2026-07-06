import { getCredentials, getTokens, saveTokens } from './db.ts';
import { httpRequest } from './http-client.ts';
import { hmacSha256Hex } from './shopee-sign.ts';

const HOST = 'https://partner.shopeemobile.com';

export interface ShopeeListing {
  itemId: number;
  sku: string;
  name: string;
  stock: number;
  status: 'NORMAL' | 'BANNED' | 'DELETED' | 'UNLIST';
}

type Auth = { token: string; shopId: string; partnerId: string; partnerKey: string };
export type AuthResult = Auth | { error: string };

export async function refreshIfNeeded(): Promise<AuthResult> {
  const tokens = await getTokens('shopee');
  const creds = await getCredentials('shopee');
  if (!creds?.client_id || !creds?.client_secret) return { error: 'Credenciais da Shopee não configuradas.' };
  if (!tokens?.access_token || !tokens.shop_id) return { error: 'Integração não configurada.' };

  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) {
    return { token: tokens.access_token, shopId: tokens.shop_id, partnerId: creds.client_id, partnerKey: creds.client_secret };
  }
  if (!tokens.refresh_token) return { error: 'Token da Shopee expirado e sem refresh_token. Refaça a conexão OAuth.' };

  const path = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacSha256Hex(creds.client_secret, `${creds.client_id}${path}${timestamp}`);

  const result = await httpRequest<{ access_token: string; refresh_token: string; expire_in: number }>(
    `${HOST}${path}?partner_id=${creds.client_id}&timestamp=${timestamp}&sign=${sign}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token, shop_id: Number(tokens.shop_id), partner_id: Number(creds.client_id) }),
      source: 'shopee',
      operation: 'oauth_refresh',
    }
  );

  if (!result.ok || !result.data?.access_token) {
    return { error: `Falha ao renovar token da Shopee: ${result.error ?? 'resposta inválida'}` };
  }

  await saveTokens('shopee', {
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at: new Date(Date.now() + result.data.expire_in * 1000).toISOString(),
    shop_id: tokens.shop_id,
  });

  return { token: result.data.access_token, shopId: tokens.shop_id, partnerId: creds.client_id, partnerKey: creds.client_secret };
}

async function signedUrl(path: string, auth: Auth, extraParams: Record<string, string> = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacSha256Hex(auth.partnerKey, `${auth.partnerId}${path}${timestamp}${auth.token}${auth.shopId}`);
  const url = new URL(`${HOST}${path}`);
  url.searchParams.set('partner_id', auth.partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);
  url.searchParams.set('access_token', auth.token);
  url.searchParams.set('shop_id', auth.shopId);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  return url.toString();
}

export async function testConnection(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, ms: 0, error: auth.error };
  const url = await signedUrl('/api/v2/shop/get_shop_info', auth);
  const result = await httpRequest(url, { source: 'shopee', operation: 'test_connection' });
  return { ok: result.ok, ms: result.ms, error: result.error };
}

export async function getListings(): Promise<{ ok: true; data: ShopeeListing[] } | { ok: false; error: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, error: auth.error };

  const listUrl = await signedUrl('/api/v2/product/get_item_list', auth, { offset: '0', page_size: '100', item_status: 'NORMAL' });
  const listRes = await httpRequest<{ response: { item: Array<{ item_id: number }> } }>(listUrl, { source: 'shopee', operation: 'get_listings' });
  if (!listRes.ok) return { ok: false, error: listRes.error ?? 'erro desconhecido' };
  const itemIds = (listRes.data?.response?.item ?? []).map((i) => i.item_id);
  if (!itemIds.length) return { ok: true, data: [] };

  const detailUrl = await signedUrl('/api/v2/product/get_item_base_info', auth, { item_id_list: itemIds.join(',') });
  const detailRes = await httpRequest<{ response: { item_list: Array<Record<string, unknown>> } }>(detailUrl, { source: 'shopee', operation: 'get_listings_detail' });
  if (!detailRes.ok) return { ok: false, error: detailRes.error ?? 'erro desconhecido' };

  // NOTA: item_sku aqui é o SKU em nível de item (sem variação). Para
  // produtos com variação (models), o SKU real fica em cada model — seria
  // necessário chamar get_model_list por item para obter o SKU por variação.
  // Não fiz essa chamada extra para não presumir a estrutura de variações
  // da conta; ajuste aqui se os produtos tiverem variações.
  const listings: ShopeeListing[] = (detailRes.data?.response?.item_list ?? []).map((it) => ({
    itemId: Number(it.item_id),
    sku: String(it.item_sku ?? it.item_id ?? ''),
    name: String(it.item_name ?? ''),
    stock: Number((it as { stock_info_v2?: { summary_info?: { total_available_stock?: number } } }).stock_info_v2?.summary_info?.total_available_stock ?? 0),
    status: String(it.item_status ?? 'DELETED') as ShopeeListing['status'],
  }));
  return { ok: true, data: listings };
}

export async function updateStock(itemId: number, quantity: number): Promise<{ ok: boolean; error?: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, error: auth.error };
  const url = await signedUrl('/api/v2/product/update_stock', auth);
  const result = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId, stock_list: [{ model_id: 0, seller_stock: [{ stock: quantity }] }] }),
    source: 'shopee',
    operation: 'update_stock',
  });
  return { ok: result.ok, error: result.error };
}

export async function unlistItem(itemId: number): Promise<{ ok: boolean; error?: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, error: auth.error };
  const url = await signedUrl('/api/v2/product/unlist_item', auth);
  const result = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_list: [{ item_id: itemId, unlist: true }] }),
    source: 'shopee',
    operation: 'unlist_item',
  });
  return { ok: result.ok, error: result.error };
}

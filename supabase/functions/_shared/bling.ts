import { getCredentials, getTokens, saveTokens } from './db.ts';
import { httpRequest } from './http-client.ts';

const API_BASE = 'https://api.bling.com.br/Api/v3';

export interface BlingProduct {
  id: string;
  sku: string;
  name: string;
  stock: number;
  price: number;
  hasPhoto: boolean;
  hasDescription: boolean;
}

export type AuthResult = { token: string } | { error: string };

export async function refreshIfNeeded(): Promise<AuthResult> {
  const tokens = await getTokens('bling');
  if (!tokens?.access_token) return { error: 'Integração não configurada.' };

  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return { token: tokens.access_token };

  if (!tokens.refresh_token) return { error: 'Token do Bling expirado e sem refresh_token. Refaça a conexão OAuth.' };

  const creds = await getCredentials('bling');
  if (!creds?.client_id || !creds?.client_secret) return { error: 'Credenciais do Bling não configuradas.' };

  const basic = btoa(`${creds.client_id}:${creds.client_secret}`);
  const result = await httpRequest<{ access_token: string; refresh_token: string; expires_in: number }>(
    `${API_BASE}/oauth/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0', Authorization: `Basic ${basic}` },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokens.refresh_token)}`,
      source: 'bling',
      operation: 'oauth_refresh',
    }
  );

  if (!result.ok || !result.data?.access_token) {
    return { error: `Falha ao renovar token do Bling: ${result.error ?? 'resposta inválida'}` };
  }

  await saveTokens('bling', {
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at: new Date(Date.now() + result.data.expires_in * 1000).toISOString(),
  });

  return { token: result.data.access_token };
}

export async function testConnection(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, ms: 0, error: auth.error };
  const result = await httpRequest(`${API_BASE}/produtos?limite=1`, { headers: { Authorization: `Bearer ${auth.token}` }, source: 'bling', operation: 'test_connection' });
  return { ok: result.ok, ms: result.ms, error: result.error };
}

export async function getProducts(): Promise<{ ok: true; data: BlingProduct[] } | { ok: false; error: string }> {
  const auth = await refreshIfNeeded();
  if ('error' in auth) return { ok: false, error: auth.error };

  const result = await httpRequest<{ data: Array<Record<string, unknown>> }>(
    `${API_BASE}/produtos?limite=100&pagina=1`,
    { headers: { Authorization: `Bearer ${auth.token}` }, source: 'bling', operation: 'get_products' }
  );
  if (!result.ok) return { ok: false, error: result.error ?? 'erro desconhecido' };

  // ATENÇÃO: os nomes de campo abaixo (codigo, descricao, preco, imagens,
  // descricaoComplementar) seguem o padrão documentado do recurso /produtos
  // da API v3, mas o campo de estoque disponível pode vir aninhado
  // (ex: objeto "estoque") dependendo do plano/conta Bling. Antes de ir para
  // produção, confirme o schema exato com uma chamada real autenticada
  // (Testar Conexão) e ajuste o mapeamento abaixo se necessário — não fiz
  // suposição adicional aqui para não arriscar mapear estoque errado.
  const items = result.data?.data ?? [];
  const products: BlingProduct[] = items.map((p) => {
    const estoqueField = p.estoque as { saldoVirtualTotal?: number } | undefined;
    const stock = Number((p as { estoqueAtual?: number }).estoqueAtual ?? estoqueField?.saldoVirtualTotal ?? 0);
    return {
      id: String(p.id ?? ''),
      sku: String(p.codigo ?? ''),
      name: String(p.descricao ?? ''),
      stock,
      price: Number(p.preco ?? 0),
      hasPhoto: Array.isArray(p.imagens) && (p.imagens as unknown[]).length > 0,
      hasDescription: Boolean(p.descricaoComplementar),
    };
  });
  return { ok: true, data: products };
}

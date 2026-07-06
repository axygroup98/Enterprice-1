import { insertSyncLog } from './db.ts';

// Camada HTTP ÚNICA usada por Bling, Mercado Livre e Shopee.
// Exigência do contrato: retry, timeout, rate limit, logs, tratamento de erro,
// tudo centralizado — nenhuma integração deve reimplementar isso por conta própria.

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  source: 'bling' | 'mercadolivre' | 'shopee';
  operation: string;
}

export interface HttpResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  ms: number;
}

// Rate limiter simples em memória (token bucket por fonte), suficiente para
// respeitar os limites documentados (ex: Bling = 3 req/s). Como cada Edge
// Function roda isolada, isto é best-effort e complementado pelo retry com
// backoff quando a própria API responde 429.
const lastCallAt: Record<string, number> = {};
const MIN_INTERVAL_MS: Record<string, number> = {
  bling: 350, // ~3 req/s
  mercadolivre: 150,
  shopee: 150,
};

async function respectRateLimit(source: string) {
  const min = MIN_INTERVAL_MS[source] ?? 100;
  const last = lastCallAt[source] ?? 0;
  const wait = min - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt[source] = Date.now();
}

export async function httpRequest<T = unknown>(url: string, opts: RequestOptions): Promise<HttpResult<T>> {
  const { method = 'GET', headers = {}, body, timeoutMs = 10000, retries = 2, source, operation } = opts;
  let attempt = 0;
  let lastError = '';
  const t0 = Date.now();

  while (attempt <= retries) {
    await respectRateLimit(source);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      clearTimeout(timeout);
      const ms = Date.now() - t0;
      const text = await res.text();
      let data: T | null = null;
      try {
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        data = text as unknown as T;
      }

      if (res.status === 429 && attempt < retries) {
        // Rate limited pela própria API — espera exponencial e tenta de novo.
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        attempt++;
        continue;
      }

      if (!res.ok) {
        await insertSyncLog({
          source,
          operation,
          status: 'error',
          duration_ms: ms,
          details: { url, status: res.status, response: data },
        });
        return { ok: false, status: res.status, data, error: `HTTP ${res.status}`, ms };
      }

      await insertSyncLog({ source, operation, status: 'success', duration_ms: ms, details: { url, status: res.status } });
      return { ok: true, status: res.status, data, ms };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : 'Erro de conexão';
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
        attempt++;
        continue;
      }
      const ms = Date.now() - t0;
      await insertSyncLog({ source, operation, status: 'error', duration_ms: ms, details: { url, error: lastError } });
      return { ok: false, status: 0, data: null, error: lastError, ms };
    }
  }

  return { ok: false, status: 0, data: null, error: lastError || 'Erro desconhecido', ms: Date.now() - t0 };
}

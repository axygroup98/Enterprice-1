import { callEdgeFunction, getEdgeFunction } from '../edge';
import {
  Divergence,
  IntegrationStatus,
  ProductMonitor,
  OrderMonitor,
  UpdateIntegrationsResult,
  ConciliationResult,
  IntegrationSource,
} from '../../types';

const SOURCE_LABELS: Record<IntegrationSource, string> = {
  bling: 'Bling',
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  system: 'Sistema',
};

// ─── Conciliação ─────────────────────────────────────────────────────────────
// Todo o cálculo de divergências agora acontece na Edge Function `reconcile`,
// que busca dados reais no Bling/ML/Shopee (nunca mock) e usa o ERP como
// fonte da verdade, conforme o princípio 01 do documento estratégico.
export async function computeDivergences(): Promise<Divergence[]> {
  const res = await callEdgeFunction<{ ok: boolean; data?: Divergence[]; notConfigured?: string[]; error?: string }>(
    'reconcile',
    { action: 'refresh_divergences' }
  );
  if (!res.ok) {
    throw new Error(res.error ?? 'Falha ao calcular divergências');
  }
  return res.data ?? [];
}

export async function fixDivergence(divergence: Divergence): Promise<{ ok: boolean; error?: string }> {
  return callEdgeFunction('reconcile', { action: 'fix_one', params: { divergenceId: divergence.id } });
}

export async function conciliarTodos(_divergences: Divergence[]): Promise<ConciliationResult> {
  // A Edge Function relê o estado atual do banco (mais seguro que confiar na
  // lista que o navegador tinha em memória, que pode estar desatualizada).
  void _divergences;
  const res = await callEdgeFunction<{ ok: boolean; updated: number; ignored: number; errors: number; durationMs: number; details: ConciliationResult['details']; error?: string }>(
    'reconcile',
    { action: 'conciliar_todos' }
  );
  if (!res.ok) throw new Error(res.error ?? 'Falha ao conciliar');
  return { updated: res.updated, ignored: res.ignored, errors: res.errors, durationMs: res.durationMs, details: res.details };
}

// ─── Status das integrações (Admin / Dashboard / Integrar) ──────────────────
interface StatusRow {
  source: IntegrationSource;
  configured: boolean;
  connected: boolean;
  tokenValid: boolean;
  lastSync: string | null;
  responseMs: number | null;
  errorCount: number;
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const res = await getEdgeFunction<{ ok: boolean; data: StatusRow[] }>('integrations-status');
  if (!res.ok) return [];
  return res.data.map((row) => ({
    source: row.source,
    label: SOURCE_LABELS[row.source],
    connected: row.tokenValid,
    lastSync: row.lastSync,
    responseMs: row.responseMs,
    errorCount: row.errorCount,
    tokenConfigured: row.configured,
  }));
}

export async function updateAllIntegrations(): Promise<UpdateIntegrationsResult> {
  return callEdgeFunction<UpdateIntegrationsResult>('reconcile', { action: 'update_integrations' });
}

// ─── Monitor (produtos e pedidos) ────────────────────────────────────────────
interface BlingProductDTO { id: string; sku: string; name: string; stock: number; hasPhoto: boolean; hasDescription: boolean }
interface MLListingDTO { itemId: string; sku: string; title: string; stock: number; status: string }
interface ShopeeListingDTO { itemId: number; sku: string; name: string; stock: number; status: string }

function mapMlStatus(status: string): ProductMonitor['mlStatus'] {
  if (status === 'active' || status === 'paused' || status === 'closed') return status;
  return 'not_listed';
}
function mapShopeeStatus(status: string): ProductMonitor['shopeeStatus'] {
  if (status === 'NORMAL') return 'active';
  if (status === 'UNLIST') return 'paused';
  if (status === 'BANNED' || status === 'DELETED') return 'closed';
  return 'not_listed';
}

export async function getProductMonitorData(): Promise<ProductMonitor[]> {
  const [blingRes, mlRes, shopeeRes] = await Promise.all([
    callEdgeFunction<{ ok: boolean; data?: BlingProductDTO[]; error?: string }>('bling-api', { action: 'get_products' }),
    callEdgeFunction<{ ok: boolean; data?: MLListingDTO[]; error?: string }>('ml-api', { action: 'get_listings' }),
    callEdgeFunction<{ ok: boolean; data?: ShopeeListingDTO[]; error?: string }>('shopee-api', { action: 'get_listings' }),
  ]);

  if (!blingRes.ok) {
    // O Bling é o ERP / fonte oficial: sem ele não existe "monitor de produtos" confiável.
    throw new Error(blingRes.error ?? 'Integração não configurada.');
  }

  const products = blingRes.data ?? [];
  const mlMap = new Map((mlRes.ok ? mlRes.data ?? [] : []).map((l) => [l.sku, l]));
  const shMap = new Map((shopeeRes.ok ? shopeeRes.data ?? [] : []).map((l) => [l.sku, l]));

  return products.map((p) => {
    const ml = mlMap.get(p.sku);
    const sh = shMap.get(p.sku);
    return {
      sku: p.sku,
      name: p.name,
      erpStock: p.stock,
      mlStock: ml?.stock ?? null,
      shopeeStock: sh?.stock ?? null,
      hasPhoto: p.hasPhoto,
      hasDescription: p.hasDescription,
      // O Bling v3 /produtos não retorna vídeo de forma confiável sem uma
      // chamada extra (mídia do anúncio); deixado como false até validarmos
      // esse campo com uma conta real, em vez de inventar um valor.
      hasVideo: false,
      mlStatus: ml ? mapMlStatus(ml.status) : 'not_listed',
      shopeeStatus: sh ? mapShopeeStatus(sh.status) : 'not_listed',
    };
  });
}

interface BlingOrderDTO {
  id?: string | number;
  numero?: string | number;
  contato?: { nome?: string };
  total?: number;
  data?: string;
  situacao?: { id?: number; valor?: number };
}

export async function getOrderMonitorData(): Promise<OrderMonitor[]> {
  const res = await callEdgeFunction<{ ok: boolean; data?: BlingOrderDTO[]; error?: string }>('bling-api', { action: 'get_orders' });
  if (!res.ok) throw new Error(res.error ?? 'Integração não configurada.');

  // ATENÇÃO: o Bling representa a situação do pedido por um código numérico
  // (situacao.id) próprio de cada conta/fluxo cadastrado. Não temos acesso a
  // uma conta real para confirmar quais códigos correspondem a "Novo",
  // "Pago", "Aguardando NF", etc. Em vez de inventar esse mapeamento,
  // devolvemos o pedido com status "new" e os dados brutos preservados —
  // ajuste esta função assim que os códigos da conta real forem
  // confirmados (ver AUDITORIA.md).
  return (res.data ?? []).map((o) => ({
    id: String(o.numero ?? o.id ?? ''),
    marketplace: 'mercadolivre' as const,
    status: 'new' as const,
    buyerName: o.contato?.nome ?? '—',
    total: Number(o.total ?? 0),
    createdAt: o.data ?? new Date().toISOString(),
    updatedAt: o.data ?? new Date().toISOString(),
  }));
}

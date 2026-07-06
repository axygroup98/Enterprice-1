import { useEffect, useState } from 'react';
import {
  Package, ShoppingBag, Plug, Search, RefreshCw,
  CheckCircle, XCircle, MinusCircle, AlertCircle,
} from 'lucide-react';
import { getProductMonitorData, getOrderMonitorData, getIntegrationStatuses } from '../lib/integrations';
import { ProductMonitor, OrderMonitor, IntegrationStatus } from '../types';

type Tab = 'produtos' | 'pedidos' | 'apis';

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Novo',
  paid: 'Pago',
  awaiting_nf: 'Aguardando NF',
  separating: 'Em Separação',
  shipped: 'Enviado',
  delivered: 'Entregue',
  stopped: 'Parado',
  processing: 'Em Andamento',
  cancelled: 'Cancelado',
  completed: 'Concluído',
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  new:         'bg-blue-50 text-blue-700 border-blue-200',
  paid:        'bg-green-50 text-green-700 border-green-200',
  awaiting_nf: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  separating:  'bg-purple-50 text-purple-700 border-purple-200',
  shipped:     'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered:   'bg-gray-50 text-gray-700 border-gray-200',
  stopped:     'bg-red-50 text-red-700 border-red-200',
  processing:  'bg-orange-50 text-orange-700 border-orange-200',
  cancelled:   'bg-red-100 text-red-800 border-red-300',
  completed:   'bg-teal-50 text-teal-700 border-teal-200',
};

const MARKETPLACE_LABELS: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  bling: 'Bling/Outros',
};

function StockBadge({ erp, mp }: { erp: number; mp: number | null }) {
  if (mp === null) return <span className="text-xs text-gray-400">Não listado</span>;
  if (erp === mp) return <span className="text-xs text-green-600 font-medium">OK ({erp})</span>;
  const color = mp > erp ? 'text-red-600' : 'text-orange-600';
  return (
    <div className="flex flex-col">
      <span className={`text-xs font-medium ${color}`}>MP: {mp}</span>
      <span className="text-xs text-gray-400">ERP: {erp}</span>
    </div>
  );
}

function QualityDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="h-4 w-4 text-gray-300 inline-flex items-center justify-center text-xs">—</span>;
  return ok ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-400" />
  );
}

function MLStatusBadge({ status }: { status: ProductMonitor['mlStatus'] }) {
  if (status === null || status === 'not_listed')
    return <span className="text-xs text-gray-400">—</span>;
  const map = {
    active: { label: 'Ativo', cls: 'text-green-700 bg-green-50' },
    paused: { label: 'Pausado', cls: 'text-yellow-700 bg-yellow-50' },
    closed: { label: 'Encerrado', cls: 'text-gray-700 bg-gray-100' },
  };
  const c = map[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>;
}

export function Monitor() {
  const [tab, setTab] = useState<Tab>('produtos');
  const [products, setProducts] = useState<ProductMonitor[]>([]);
  const [orders, setOrders] = useState<OrderMonitor[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [prods, ords, ints] = await Promise.all([
        getProductMonitorData(),
        getOrderMonitorData(),
        getIntegrationStatuses(),
      ]);
      setProducts(prods);
      setOrders(ords);
      setIntegrations(ints);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Integração não configurada.');
      setProducts([]);
      setOrders([]);
    }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const filteredProducts = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  const filteredOrders = orders.filter((o) =>
    orderFilter === 'all' || o.status === orderFilter
  );

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'produtos', label: 'Produtos', icon: Package },
    { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
    { id: 'apis', label: 'APIs', icon: Plug },
  ];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Produtos tab */}
      {tab === 'produtos' && (
        <div className="space-y-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar SKU ou nome..."
              className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">SKU</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Nome</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">ERP</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">ML</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Shopee</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Foto</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Descrição</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Vídeo</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Status ML</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Status Shopee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 10 }).map((__, j) => (
                          <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                        {error ? 'Configure as integrações em Administrar para ver os produtos.' : 'Nenhum produto encontrado.'}
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr key={p.sku} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-700">{p.sku}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm text-gray-900 max-w-48 block truncate">{p.name}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-sm font-semibold text-gray-900">{p.erpStock}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <StockBadge erp={p.erpStock} mp={p.mlStock} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <StockBadge erp={p.erpStock} mp={p.shopeeStock} />
                        </td>
                        <td className="px-3 py-3 text-center flex justify-center"><QualityDot ok={p.hasPhoto} /></td>
                        <td className="px-3 py-3 text-center"><div className="flex justify-center"><QualityDot ok={p.hasDescription} /></div></td>
                        <td className="px-3 py-3 text-center"><div className="flex justify-center"><QualityDot ok={p.hasVideo} /></div></td>
                        <td className="px-3 py-3 text-center"><MLStatusBadge status={p.mlStatus} /></td>
                        <td className="px-3 py-3 text-center"><MLStatusBadge status={p.shopeeStatus} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && filteredProducts.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">{filteredProducts.length} produto(s)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pedidos tab */}
      {tab === 'pedidos' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['all', 'new', 'processing', 'stopped', 'cancelled', 'completed'].map((s) => (
              <button
                key={s}
                onClick={() => setOrderFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  orderFilter === s
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {s === 'all' ? 'Todos' : ORDER_STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Pedido</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Canal</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Comprador</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">Total</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                        {error ? 'Configure a integração com o Bling em Administrar.' : 'Nenhum pedido encontrado.'}
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => {
                      const colorCls = ORDER_STATUS_COLORS[o.status] ?? 'bg-gray-50 text-gray-700 border-gray-200';
                      const isStopped = o.status === 'stopped' || o.status === 'cancelled';
                      return (
                        <tr key={o.id} className={`hover:bg-gray-50 transition-colors ${isStopped ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono text-gray-700">#{o.id}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                              {MARKETPLACE_LABELS[o.marketplace] ?? o.marketplace}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-sm text-gray-900">{o.buyerName}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-sm font-semibold text-gray-900">
                              {o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colorCls}`}>
                              {ORDER_STATUS_LABELS[o.status] ?? o.status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs text-gray-500">
                              {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {!loading && filteredOrders.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">{filteredOrders.length} pedido(s)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APIs tab */}
      {tab === 'apis' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['bling', 'mercadolivre', 'shopee'] as const).map((source) => {
            const int = integrations.find((i) => i.source === source);
            return (
              <div key={source} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 capitalize">
                    {source === 'mercadolivre' ? 'Mercado Livre' : source.charAt(0).toUpperCase() + source.slice(1)}
                  </h3>
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    !int ? 'bg-gray-300' :
                    int.connected ? 'bg-green-500' :
                    int.tokenConfigured ? 'bg-yellow-400' :
                    'bg-gray-300'
                  }`} />
                </div>
                <StatRow label="Token" value={
                  !int ? '—' :
                  int.tokenConfigured ? 'Configurado' :
                  'Não configurado'
                } />
                <StatRow label="Conexão" value={
                  !int ? '—' :
                  int.connected ? 'Conectado' : 'Não conectado'
                } />
                <StatRow label="Última sinc." value={int?.lastSync ? new Date(int.lastSync).toLocaleString('pt-BR') : '—'} />
                <StatRow label="Resp. média" value={int?.responseMs ? `${int.responseMs}ms` : '—'} />
                <StatRow label="Erros (60 logs)" value={String(int?.errorCount ?? '—')} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  );
}

// Suppress unused import warning — MinusCircle is kept for future use
void MinusCircle;

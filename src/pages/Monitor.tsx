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
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  new:         'bg-blue-50 text-blue-700 border-blue-200',
  paid:        'bg-green-50 text-green-700 border-green-200',
  awaiting_nf: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  separating:  'bg-purple-50 text-purple-700 border-purple-200',
  shipped:     'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered:   'bg-gray-50 text-gray-700 border-gray-200',
  stopped:     'bg-red-50 text-red-700 border-red-200',
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

function QualityDot({ ok }: { ok: boolean }) {
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

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOrders =
    orderFilter === 'all' ? orders : orders.filter((o) => o.status === orderFilter);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'produtos', label: 'Produtos', icon: Package },
    { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
    { id: 'apis', label: 'APIs', icon: Plug },
  ];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <span>⚠ {error}</span>
        </div>
      )}

      {/* Produtos Tab */}
      {tab === 'produtos' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto ou SKU..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-gray-400">{filteredProducts.length} produto(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Produto / SKU</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">ERP</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">ML Stock</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Shopee Stock</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Foto</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Desc.</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Vídeo</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Status ML</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Status Shopee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-48" /></td>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-3 py-3 text-center"><div className="h-4 bg-gray-200 rounded w-8 mx-auto" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                      Nenhum produto encontrado
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.sku} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{p.name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{p.sku}</p>
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
        </div>
      )}

      {/* Pedidos Tab */}
      {tab === 'pedidos' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Filtrar:</span>
            {['all', 'new', 'paid', 'awaiting_nf', 'separating', 'shipped', 'delivered', 'stopped'].map((f) => (
              <button
                key={f}
                onClick={() => setOrderFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  orderFilter === f
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {f === 'all' ? 'Todos' : ORDER_STATUS_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Pedido</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Canal</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Comprador</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">Total</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Status</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Criado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                      Nenhum pedido encontrado
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className={`hover:bg-gray-50 transition-colors ${o.status === 'stopped' ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono font-medium text-gray-900">{o.id}</p>
                        {o.status === 'stopped' && o.daysStopped != null && (
                          <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="h-3 w-3" /> Parado há {o.daysStopped} dia(s)
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                          o.marketplace === 'mercadolivre'
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-orange-50 text-orange-700 border-orange-200'
                        }`}>
                          {o.marketplace === 'mercadolivre' ? 'Mercado Livre' : 'Shopee'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{o.buyerName}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900">
                        {o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${ORDER_STATUS_COLORS[o.status]}`}>
                          {ORDER_STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {new Date(o.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* APIs Tab */}
      {tab === 'apis' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                  <div className="h-5 w-28 bg-gray-200 rounded mb-4" />
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((j) => <div key={j} className="h-4 bg-gray-100 rounded" />)}
                  </div>
                </div>
              ))
            : integrations.map((int) => (
                <div key={int.source} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">{int.label}</h3>
                    <span
                      className={`h-3 w-3 rounded-full ${
                        !int.tokenConfigured ? 'bg-gray-300' : int.connected ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                  </div>
                  <div className="space-y-3">
                    <Row label="Token" value={int.tokenConfigured ? 'Configurado' : 'Não configurado'} ok={int.tokenConfigured} />
                    <Row label="Status" value={int.connected ? 'Conectado' : int.tokenConfigured ? 'Erro' : 'Sem token'} ok={int.connected} />
                    <Row
                      label="Última sync"
                      value={int.lastSync ? new Date(int.lastSync).toLocaleString('pt-BR') : 'Nunca'}
                      ok={Boolean(int.lastSync)}
                    />
                    <Row
                      label="Tempo médio"
                      value={int.responseMs != null ? `${int.responseMs}ms` : '—'}
                      ok={int.responseMs != null && int.responseMs < 1000}
                    />
                    <Row
                      label="Erros recentes"
                      value={String(int.errorCount)}
                      ok={int.errorCount === 0}
                    />
                  </div>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <MinusCircle className="h-3.5 w-3.5 text-gray-300" />}
        <span className="text-xs font-medium text-gray-700">{value}</span>
      </div>
    </div>
  );
}

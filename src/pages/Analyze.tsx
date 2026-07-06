import { useEffect, useState } from 'react';
import {
  Package, AlertTriangle, ShoppingBag, Pause,
  Clock, TrendingDown, ArrowRight, X, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getProductMonitorData, getOrderMonitorData } from '../lib/integrations';
import { Divergence, ProductMonitor, OrderMonitor } from '../types';
import { Page } from '../components/Sidebar';

interface AnalysisCard {
  id: string;
  icon: React.ElementType;
  title: string;
  count: number;
  description: string;
  severity: 'critical' | 'warning' | 'info' | 'neutral';
  items: Array<{ label: string; detail: string }>;
  actionLabel: string;
  actionPage?: Page;
}

interface Props {
  onNavigate: (page: Page) => void;
}

export function Analyze({ onNavigate }: Props) {
  const [cards, setCards] = useState<AnalysisCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<AnalysisCard | null>(null);

  useEffect(() => {
    async function build() {
      setLoading(true);
      let products: ProductMonitor[] = [];
      let orders: OrderMonitor[] = [];
      let divs: Divergence[] = [];

      const divRes = await supabase.from('divergences').select('*').eq('resolved', false).eq('ignored', false);
      divs = (divRes.data ?? []) as Divergence[];

      try {
        [products, orders] = await Promise.all([getProductMonitorData(), getOrderMonitorData()]);
      } catch (err) {
        // Integração não configurada: seguimos só com o que já está no banco
        // (divergências calculadas na última sincronização), sem inventar dados.
        console.error(err);
      }

      const stockDivs = divs.filter((d) => d.divergence_type === 'stock');
      const noPhoto = products.filter((p) => !p.hasPhoto);
      const noDesc = products.filter((p) => !p.hasDescription);
      const stoppedOrders = orders.filter((o) => o.status === 'stopped');
      const pausedListings = products.filter((p) => p.mlStatus === 'paused' && p.erpStock > 0);
      const unlinkedListings = divs.filter((d) => d.divergence_type === 'unlinked');
      const zeroStockActive = products.filter((p) => p.mlStock === 0 && p.mlStatus === 'active');

      const result: AnalysisCard[] = [
        {
          id: 'stock-divs',
          icon: TrendingDown,
          title: 'Divergências de Estoque',
          count: stockDivs.length,
          description: 'Produtos com estoque diferente entre ERP e marketplaces',
          severity: stockDivs.length > 0 ? 'critical' : 'neutral',
          items: stockDivs.map((d) => ({
            label: `${d.product_name} (${d.sku})`,
            detail: `ERP: ${d.erp_value} | ${d.marketplace === 'mercadolivre' ? 'ML' : 'Shopee'}: ${d.ml_value ?? d.shopee_value}`,
          })),
          actionLabel: 'Ver Conciliação',
          actionPage: 'conciliacao',
        },
        {
          id: 'no-photo',
          icon: Package,
          title: 'Produtos sem Foto',
          count: noPhoto.length,
          description: 'Produtos cadastrados no ERP sem imagem',
          severity: noPhoto.length > 5 ? 'warning' : noPhoto.length > 0 ? 'info' : 'neutral',
          items: noPhoto.map((p) => ({ label: p.name, detail: `SKU: ${p.sku}` })),
          actionLabel: 'Ver Produtos',
          actionPage: 'monitor',
        },
        {
          id: 'no-desc',
          icon: Package,
          title: 'Produtos sem Descrição',
          count: noDesc.length,
          description: 'Produtos sem descrição complementar no ERP',
          severity: noDesc.length > 5 ? 'warning' : noDesc.length > 0 ? 'info' : 'neutral',
          items: noDesc.map((p) => ({ label: p.name, detail: `SKU: ${p.sku}` })),
          actionLabel: 'Ver Produtos',
          actionPage: 'monitor',
        },
        {
          id: 'stopped-orders',
          icon: Clock,
          title: 'Pedidos Parados',
          count: stoppedOrders.length,
          description: 'Pedidos sem movimentação por mais de 48h',
          severity: stoppedOrders.length > 0 ? 'critical' : 'neutral',
          items: stoppedOrders.map((o) => ({
            label: `${o.id} — ${o.buyerName}`,
            detail: `Parado há ${o.daysStopped ?? '?'} dia(s) · ${o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          })),
          actionLabel: 'Ver Pedidos',
          actionPage: 'monitor',
        },
        {
          id: 'paused-with-stock',
          icon: Pause,
          title: 'Anúncios Pausados com Estoque',
          count: pausedListings.length,
          description: 'Anúncios pausados enquanto o ERP tem estoque disponível',
          severity: pausedListings.length > 0 ? 'warning' : 'neutral',
          items: pausedListings.map((l) => ({
            label: l.name,
            detail: `SKU: ${l.sku} | ML estoque: ${l.mlStock}`,
          })),
          actionLabel: 'Ver Conciliação',
          actionPage: 'conciliacao',
        },
        {
          id: 'unlinked-listings',
          icon: AlertTriangle,
          title: 'Anúncios sem Vínculo no ERP',
          count: unlinkedListings.length,
          description: 'Anúncios nos marketplaces sem SKU vinculado ao ERP — requerem revisão manual',
          severity: unlinkedListings.length > 0 ? 'critical' : 'neutral',
          items: unlinkedListings.map((d) => ({
            label: d.product_name,
            detail: `SKU: ${d.sku} | Canal: ${d.marketplace === 'mercadolivre' ? 'Mercado Livre' : 'Shopee'}`,
          })),
          actionLabel: 'Revisar na Conciliação',
          actionPage: 'conciliacao',
        },
        {
          id: 'zero-stock-active',
          icon: ShoppingBag,
          title: 'Anúncios Ativos com Estoque Zero',
          count: zeroStockActive.length,
          description: 'Anúncios ativos no Mercado Livre sem estoque disponível',
          severity: zeroStockActive.length > 0 ? 'critical' : 'neutral',
          items: zeroStockActive.map((l) => ({
            label: l.name,
            detail: `SKU: ${l.sku} | Estoque: 0`,
          })),
          actionLabel: 'Ver Conciliação',
          actionPage: 'conciliacao',
        },
      ];

      setCards(result);
      setLoading(false);
    }
    build();
  }, []);

  const severityStyle: Record<string, string> = {
    critical: 'bg-red-50 border-red-200 hover:border-red-400',
    warning:  'bg-orange-50 border-orange-200 hover:border-orange-400',
    info:     'bg-blue-50 border-blue-200 hover:border-blue-400',
    neutral:  'bg-gray-50 border-gray-200 hover:border-gray-300',
  };
  const severityIcon: Record<string, string> = {
    critical: 'text-red-500',
    warning:  'text-orange-500',
    info:     'text-blue-500',
    neutral:  'text-gray-400',
  };
  const severityCount: Record<string, string> = {
    critical: 'text-red-700',
    warning:  'text-orange-700',
    info:     'text-blue-700',
    neutral:  'text-gray-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          Dados transformados em decisões. Clique em qualquer card para ver os itens detalhados.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-5 w-5 bg-gray-200 rounded mb-3" />
              <div className="h-8 w-12 bg-gray-200 rounded mb-2" />
              <div className="h-4 w-40 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => setActiveCard(card)}
                className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${severityStyle[card.severity]} ${card.count > 0 ? 'shadow-sm' : 'opacity-70'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <Icon className={`h-5 w-5 ${severityIcon[card.severity]}`} />
                  {card.count > 0 && (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <p className={`text-3xl font-bold mb-1 ${severityCount[card.severity]}`}>{card.count}</p>
                <p className="text-sm font-semibold text-gray-900">{card.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{card.description}</p>
                {card.count > 0 && card.actionPage && (
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                    {card.actionLabel} <ArrowRight className="h-3 w-3" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Detail drawer / modal */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActiveCard(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">{activeCard.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{activeCard.count} item(s) encontrado(s)</p>
              </div>
              <button onClick={() => setActiveCard(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {activeCard.items.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Nenhum item encontrado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeCard.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-xs font-mono text-gray-400 mt-0.5 w-5 text-right flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {activeCard.actionPage && activeCard.count > 0 && (
              <div className="p-5 border-t border-gray-100">
                <button
                  onClick={() => { setActiveCard(null); onNavigate(activeCard.actionPage!); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                >
                  {activeCard.actionLabel} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

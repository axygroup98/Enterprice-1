import { useEffect, useState } from 'react';
import {
  AlertTriangle, AlertCircle, Info, TrendingUp,
  ShoppingBag, RefreshCw, CheckCircle, XCircle,
  Clock, Zap, Package, ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getIntegrationStatuses, updateAllIntegrations, getOrderMonitorData } from '../lib/integrations';
import { AuditRecord, IntegrationStatus, UpdateIntegrationsResult } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProgressModal, ProgressStep } from '../components/ProgressModal';
import { Page } from '../components/Sidebar';

interface Props {
  onNavigate: (page: Page) => void;
}

interface Summary {
  critical: number;
  high: number;
  medium: number;
  informative: number;
  ordersToday: number;
  stoppedOrders: number;
  resolvedToday: number;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Agora mesmo';
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

export function Dashboard({ onNavigate }: Props) {
  const [summary, setSummary] = useState<Summary>({
    critical: 0, high: 0, medium: 0, informative: 0,
    ordersToday: 0, stoppedOrders: 0, resolvedToday: 0,
  });
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressSummary, setProgressSummary] = useState('');
  const [progressDone, setProgressDone] = useState(false);

  async function loadData() {
    setLoading(true);
    const [divRes, auditRes, intStatus] = await Promise.all([
      supabase.from('divergences').select('priority, resolved, resolved_at').eq('ignored', false),
      supabase.from('audit_records').select('*').order('created_at', { ascending: false }).limit(8),
      getIntegrationStatuses(),
    ]);

    let ordersToday = 0;
    let stoppedOrders = 0;
    try {
      const orders = await getOrderMonitorData();
      const todayStart0 = new Date(); todayStart0.setHours(0, 0, 0, 0);
      ordersToday = orders.filter((o) => new Date(o.createdAt) >= todayStart0).length;
      // stoppedOrders fica em 0 até confirmarmos o mapeamento real dos
      // códigos de situação do Bling (ver nota em lib/integrations/index.ts)
      stoppedOrders = orders.filter((o) => o.status === 'stopped').length;
    } catch {
      // Bling não configurado ainda: mantém os contadores de pedidos em 0
      // em vez de inventar um número, e o restante do dashboard segue normal.
    }

    const divs = divRes.data ?? [];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    setSummary({
      critical: divs.filter((d) => d.priority === 'critical' && !d.resolved).length,
      high: divs.filter((d) => d.priority === 'high' && !d.resolved).length,
      medium: divs.filter((d) => d.priority === 'medium' && !d.resolved).length,
      informative: divs.filter((d) => d.priority === 'informative' && !d.resolved).length,
      ordersToday,
      stoppedOrders,
      resolvedToday: divs.filter(
        (d) => d.resolved && d.resolved_at && new Date(d.resolved_at) >= todayStart
      ).length,
    });

    setAudits((auditRes.data ?? []) as AuditRecord[]);
    setIntegrations(intStatus);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleUpdateIntegrations() {
    setConfirmOpen(false);
    const initial: ProgressStep[] = [
      { id: 'bling', label: 'Bling (ERP)', status: 'running' },
      { id: 'ml', label: 'Mercado Livre', status: 'pending' },
      { id: 'shopee', label: 'Shopee', status: 'pending' },
    ];
    setProgressSteps(initial);
    setProgressSummary('');
    setProgressDone(false);
    setProgressOpen(true);

    const result: UpdateIntegrationsResult = await updateAllIntegrations();

    setProgressSteps([
      { id: 'bling', label: 'Bling (ERP)', status: result.bling.success ? 'success' : 'error', detail: result.bling.error },
      { id: 'ml', label: 'Mercado Livre', status: result.mercadolivre.success ? 'success' : 'error', detail: result.mercadolivre.error },
      { id: 'shopee', label: 'Shopee', status: result.shopee.success ? 'success' : 'error', detail: result.shopee.error },
    ]);

    const secs = (result.totalDurationMs / 1000).toFixed(1);
    const lines = [
      `Atualização concluída. Tempo total: ${secs}s\n`,
      `Bling ${result.bling.success ? '✔' : `✘ (${result.bling.error ?? 'erro'})`}`,
      `Mercado Livre ${result.mercadolivre.success ? '✔' : `✘ (${result.mercadolivre.error ?? 'erro'})`}`,
      `Shopee ${result.shopee.success ? '✔' : `✘ (${result.shopee.error ?? 'erro'})`}`,
    ];
    setProgressSummary(lines.join('\n'));
    setProgressDone(true);
    loadData();
  }

  const totalProblems = summary.critical + summary.high + summary.medium + summary.informative;

  const summaryCards = [
    {
      label: 'Críticos',
      value: summary.critical,
      icon: AlertCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      dot: 'bg-red-500',
    },
    {
      label: 'Altos',
      value: summary.high,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      dot: 'bg-orange-500',
    },
    {
      label: 'Médios',
      value: summary.medium,
      icon: TrendingUp,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      dot: 'bg-yellow-500',
    },
    {
      label: 'Informativos',
      value: summary.informative,
      icon: Info,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      dot: 'bg-blue-500',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome + Actions */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bem-vindo.</h2>
          <p className="text-gray-500 text-sm mt-1">
            Centro de Inteligência Operacional — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar Integrações
        </button>
      </div>

      {/* Problem summary cards */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Problemas Ativos</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                onClick={() => onNavigate('conciliacao')}
                className={`p-4 rounded-xl border ${card.bg} ${card.border} text-left hover:shadow-md transition-all group`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className={`h-5 w-5 ${card.color}`} />
                  {card.value > 0 && (
                    <span className={`h-2 w-2 rounded-full ${card.dot} animate-pulse`} />
                  )}
                </div>
                <p className={`text-3xl font-bold ${card.color}`}>{loading ? '—' : card.value}</p>
                <p className="text-xs font-medium text-gray-600 mt-1">{card.label}</p>
              </button>
            );
          })}
        </div>
        {!loading && totalProblems > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-gray-600">{totalProblems} problema(s) total</span>
            <button
              onClick={() => onNavigate('conciliacao')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              Ver Conciliação <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Indicators row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '—' : summary.ordersToday}</p>
              <p className="text-xs text-gray-500">Pedidos Hoje</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '—' : summary.stoppedOrders}</p>
              <p className="text-xs text-gray-500">Pedidos Parados</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '—' : summary.resolvedToday}</p>
              <p className="text-xs text-gray-500">Corrigidos Hoje</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: integrations + recent audits */}
      <div className="grid grid-cols-2 gap-6">
        {/* Integration status */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Status das Integrações</h3>
            <button onClick={() => onNavigate('integrar')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Ver detalhes
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {loading
              ? [1, 2, 3].map((i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-3 animate-pulse">
                    <div className="h-3 w-3 rounded-full bg-gray-200" />
                    <div className="h-4 w-28 bg-gray-200 rounded" />
                    <div className="ml-auto h-4 w-16 bg-gray-200 rounded" />
                  </div>
                ))
              : integrations.map((int) => (
                  <div key={int.source} className="px-5 py-3.5 flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        !int.tokenConfigured
                          ? 'bg-gray-300'
                          : int.connected
                          ? 'bg-green-500'
                          : 'bg-red-500'
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-800">{int.label}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {!int.tokenConfigured ? (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Não configurado</span>
                      ) : int.connected ? (
                        <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Conectado
                        </span>
                      ) : (
                        <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Erro
                        </span>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </div>

        {/* Recent audits */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Auditorias Recentes</h3>
            <button onClick={() => onNavigate('integrar')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Ver logs
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3 animate-pulse">
                  <div className="h-4 w-4 rounded bg-gray-200" />
                  <div className="flex-1 h-4 bg-gray-200 rounded" />
                  <div className="h-3 w-12 bg-gray-200 rounded" />
                </div>
              ))
            ) : audits.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Package className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhuma auditoria registrada</p>
              </div>
            ) : (
              audits.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-start gap-3">
                  {a.result === 'success' && <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />}
                  {a.result === 'error' && <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />}
                  {a.result === 'partial' && <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />}
                  {a.result === 'info' && <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 font-medium leading-snug truncate">{a.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">{a.module}</p>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">{formatRelative(a.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Confirm update */}
      <ConfirmModal
        open={confirmOpen}
        title="Atualizar Integrações"
        message={`Deseja atualizar todas as integrações agora?\n\nSerão consultadas todas as APIs configuradas.\n\nBling\nMercado Livre\nShopee`}
        confirmLabel="Atualizar"
        cancelLabel="Cancelar"
        onConfirm={handleUpdateIntegrations}
        onCancel={() => setConfirmOpen(false)}
        variant="info"
      />

      <ProgressModal
        open={progressOpen}
        title="Atualizando Integrações..."
        steps={progressSteps}
        summary={progressSummary}
        finished={progressDone}
        onClose={() => setProgressOpen(false)}
      />
    </div>
  );
}

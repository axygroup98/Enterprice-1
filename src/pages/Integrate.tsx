import { useEffect, useState } from 'react';
import {
  CheckCircle, XCircle, Clock, RefreshCw,
  Activity, AlertTriangle,
  Loader2, Database, Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getIntegrationStatuses, updateAllIntegrations } from '../lib/integrations';
import { IntegrationStatus, SyncLog } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProgressModal, ProgressStep } from '../components/ProgressModal';

const LOG_STATUS_CONFIG = {
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  error:   { icon: XCircle,     color: 'text-red-500',   bg: 'bg-red-50' },
  partial: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50' },
};

const SOURCE_LABELS: Record<string, string> = {
  bling:       'Bling',
  mercadolivre:'Mercado Livre',
  shopee:      'Shopee',
  system:      'Sistema',
};

const SOURCE_COLORS: Record<string, string> = {
  bling:       'bg-blue-100 text-blue-700',
  mercadolivre:'bg-yellow-100 text-yellow-700',
  shopee:      'bg-orange-100 text-orange-700',
  system:      'bg-gray-100 text-gray-700',
};

const OPERATION_LABELS: Record<string, string> = {
  connection_test: 'Teste de conexão',
  sync_stock:      'Sincronizar estoque',
  fix_stock:       'Corrigir estoque',
  fix_status:      'Corrigir status',
  fix_orphan:      'Encerrar anúncio',
  fix_photo:       'Foto (manual)',
  fix_description: 'Descrição (manual)',
  conciliar_todos: 'Conciliar todos',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function Integrate() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(true);
  const [logSource, setLogSource] = useState<string>('all');
  const [logStatus, setLogStatus] = useState<string>('all');
  const [confirmSync, setConfirmSync] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressSummary, setProgressSummary] = useState('');
  const [progressDone, setProgressDone] = useState(false);

  async function loadAll() {
    setLoading(true);
    const ints = await getIntegrationStatuses();
    setIntegrations(ints);
    setLoading(false);
  }

  async function loadLogs() {
    setLogLoading(true);
    let query = supabase
      .from('sync_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (logSource !== 'all') query = query.eq('source', logSource);
    if (logStatus !== 'all') query = query.eq('status', logStatus);
    const { data } = await query;
    setLogs((data ?? []) as SyncLog[]);
    setLogLoading(false);
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadLogs(); }, [logSource, logStatus]);

  async function handleSync() {
    setConfirmSync(false);
    const initial: ProgressStep[] = [
      { id: 'bling', label: 'Bling (ERP)', status: 'running' },
      { id: 'ml', label: 'Mercado Livre', status: 'pending' },
      { id: 'shopee', label: 'Shopee', status: 'pending' },
    ];
    setProgressSteps(initial);
    setProgressSummary('');
    setProgressDone(false);
    setProgressOpen(true);

    const result = await updateAllIntegrations();
    setProgressSteps([
      { id: 'bling', label: 'Bling (ERP)', status: result.bling.success ? 'success' : 'error', detail: result.bling.error },
      { id: 'ml', label: 'Mercado Livre', status: result.mercadolivre.success ? 'success' : 'error', detail: result.mercadolivre.error },
      { id: 'shopee', label: 'Shopee', status: result.shopee.success ? 'success' : 'error', detail: result.shopee.error },
    ]);
    const secs = (result.totalDurationMs / 1000).toFixed(1);
    setProgressSummary([
      `Sincronização concluída. Tempo: ${secs}s`,
      `Bling ${result.bling.success ? '✔' : `✘ ${result.bling.error ?? ''}`}`,
      `Mercado Livre ${result.mercadolivre.success ? '✔' : `✘ ${result.mercadolivre.error ?? ''}`}`,
      `Shopee ${result.shopee.success ? '✔' : `✘ ${result.shopee.error ?? ''}`}`,
    ].join('\n'));
    setProgressDone(true);
    loadAll();
    loadLogs();
  }

  return (
    <div className="space-y-8">
      {/* Integration cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Status das Integrações</h3>
          <div className="flex gap-2">
            <button
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar Status
            </button>
            <button
              onClick={() => setConfirmSync(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Sincronizar Agora
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-5 w-28 bg-gray-200 rounded" />
                    <div className="h-3 w-3 rounded-full bg-gray-200" />
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((j) => <div key={j} className="h-4 bg-gray-100 rounded" />)}
                  </div>
                </div>
              ))
            : integrations.map((int) => (
                <IntegrationCard key={int.source} int={int} />
              ))}
        </div>
      </div>

      {/* Sync logs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Logs de Sincronização</h3>
          <div className="flex gap-2">
            <select
              value={logSource}
              onChange={(e) => setLogSource(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Todos os sistemas</option>
              <option value="bling">Bling</option>
              <option value="mercadolivre">Mercado Livre</option>
              <option value="shopee">Shopee</option>
              <option value="system">Sistema</option>
            </select>
            <select
              value={logStatus}
              onChange={(e) => setLogStatus(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Todos os status</option>
              <option value="success">Sucesso</option>
              <option value="error">Erro</option>
              <option value="partial">Parcial</option>
            </select>
            <button
              onClick={loadLogs}
              disabled={logLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${logLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {logLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Database className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">Nenhum log encontrado</p>
              <p className="text-xs text-gray-400 mt-1">Execute uma sincronização para registrar logs</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-10">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Data / Hora</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Sistema</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Operação</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">Duração</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((log) => {
                    const cfg = LOG_STATUS_CONFIG[log.status] ?? LOG_STATUS_CONFIG.partial;
                    const Icon = cfg.icon;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className={`inline-flex p-1 rounded-full ${cfg.bg}`}>
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_COLORS[log.source] ?? 'bg-gray-100 text-gray-700'}`}>
                            {SOURCE_LABELS[log.source] ?? log.source}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700">
                          {OPERATION_LABELS[log.operation] ?? log.operation}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-gray-500 font-mono">
                          {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                          {log.details && Object.keys(log.details).length > 0
                            ? (log.details as Record<string, unknown>).error
                              ? <span className="text-red-600">{String((log.details as Record<string, unknown>).error)}</span>
                              : JSON.stringify(log.details).slice(0, 60)
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirm */}
      <ConfirmModal
        open={confirmSync}
        title="Sincronizar Integrações"
        message="Deseja testar a conexão e sincronizar todas as integrações agora?"
        confirmLabel="Sincronizar"
        cancelLabel="Cancelar"
        onConfirm={handleSync}
        onCancel={() => setConfirmSync(false)}
        variant="info"
      />
      <ProgressModal
        open={progressOpen}
        title="Sincronizando integrações..."
        steps={progressSteps}
        summary={progressSummary}
        finished={progressDone}
        onClose={() => setProgressOpen(false)}
      />
    </div>
  );
}

function IntegrationCard({ int }: { int: IntegrationStatus }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-900">{int.label}</h3>
        <span
          className={`h-3 w-3 rounded-full ${
            !int.tokenConfigured ? 'bg-gray-300' : int.connected ? 'bg-green-500' : 'bg-red-500'
          }`}
          title={!int.tokenConfigured ? 'Sem token' : int.connected ? 'Conectado' : 'Erro'}
        />
      </div>
      <div className="space-y-3">
        <StatRow icon={Activity} label="Token" value={int.tokenConfigured ? 'Configurado' : 'Não configurado'} ok={int.tokenConfigured} />
        <StatRow icon={CheckCircle} label="Conexão" value={int.connected ? 'OK' : 'Falhou'} ok={int.connected} />
        <StatRow icon={Clock} label="Última sync" value={int.lastSync ? new Date(int.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca'} ok={Boolean(int.lastSync)} />
        <StatRow icon={Zap} label="Tempo médio" value={int.responseMs != null ? `${int.responseMs}ms` : '—'} ok={int.responseMs != null && int.responseMs < 2000} />
        <StatRow icon={XCircle} label="Erros recentes" value={String(int.errorCount)} ok={int.errorCount === 0} />
      </div>
    </div>
  );
}

function StatRow({ icon: Icon, label, value, ok }: { icon: React.ElementType; label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-gray-300'}`} />
        <span className="text-xs font-medium text-gray-700">{value}</span>
      </div>
    </div>
  );
}

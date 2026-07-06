import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, GitCompareArrows, CheckSquare, Square,
  Wrench, Filter, Search, CheckCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { computeDivergences, fixDivergence } from '../lib/integrations';
import { Divergence, Priority, ConciliationResult } from '../types';
import { PriorityBadge } from '../components/PriorityBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProgressModal, ProgressStep } from '../components/ProgressModal';

const DIVERGENCE_TYPE_LABELS: Record<string, string> = {
  stock: 'Estoque',
  title: 'Título',
  status: 'Status',
  photo: 'Foto',
  description: 'Descrição',
  price: 'Preço',
  orphan: 'Anúncio Fantasma',
};


export function Conciliation() {
  const [divergences, setDivergences] = useState<Divergence[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressSummary, setProgressSummary] = useState('');
  const [progressDone, setProgressDone] = useState(false);

  const loadDivergences = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('divergences')
      .select('*')
      .eq('resolved', false)
      .eq('ignored', false)
      .order('created_at', { ascending: false });
    setDivergences((data ?? []) as Divergence[]);
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { loadDivergences(); }, [loadDivergences]);

  async function runSync() {
    setSyncing(true);
    try {
      await computeDivergences();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Falha ao sincronizar. Verifique as integrações em Administrar.');
    }
    await loadDivergences();
    setSyncing(false);
  }

  async function handleFixSingle(div: Divergence) {
    setFixingId(div.id);
    await fixDivergence(div);
    await loadDivergences();
    setFixingId(null);
  }

  async function handleConciliarTodos() {
    setConfirmAll(false);
    const initial: ProgressStep[] = visible.map((d) => ({
      id: d.id,
      label: `${d.product_name} — ${DIVERGENCE_TYPE_LABELS[d.divergence_type]}`,
      status: 'pending',
    }));
    setProgressSteps(initial);
    setProgressSummary('');
    setProgressDone(false);
    setProgressOpen(true);

    // Run with per-item progress
    const result = await conciliarTodosWithProgress(visible, (id, status, detail) => {
      setProgressSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, detail } : s))
      );
    });

    const secs = (result.durationMs / 1000).toFixed(1);
    setProgressSummary(
      `Conciliação concluída.\n${result.updated} produto(s) atualizado(s).\n${result.ignored} produto(s) ignorado(s).\n${result.errors} erro(s) de API.\nTempo: ${secs}s`
    );
    setProgressDone(true);
    await loadDivergences();
  }

  const filtered = divergences.filter((d) => {
    if (priorityFilter !== 'all' && d.priority !== priorityFilter) return false;
    if (typeFilter !== 'all' && d.divergence_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.product_name.toLowerCase().includes(q) && !d.sku.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const visible = filtered;
  const allSelected = visible.length > 0 && visible.every((d) => selected.has(d.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((d) => d.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const countsByPriority = {
    critical: divergences.filter((d) => d.priority === 'critical').length,
    high: divergences.filter((d) => d.priority === 'high').length,
    medium: divergences.filter((d) => d.priority === 'medium').length,
    informative: divergences.filter((d) => d.priority === 'informative').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-red-700">{countsByPriority.critical} Críticos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-xs font-semibold text-orange-700">{countsByPriority.high} Altos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-xs font-semibold text-yellow-700">{countsByPriority.medium} Médios</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-700">{countsByPriority.informative} Informativos</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
          <button
            onClick={() => setConfirmAll(true)}
            disabled={divergences.length === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GitCompareArrows className="h-4 w-4" />
            Conciliar Todos
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto ou SKU..."
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <Filter className="h-4 w-4" />
        </div>
        {(['all', 'critical', 'high', 'medium', 'informative'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              priorityFilter === p
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {p === 'all' ? 'Todos' : p === 'critical' ? 'Crítico' : p === 'high' ? 'Alto' : p === 'medium' ? 'Médio' : 'Info'}
          </button>
        ))}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos os tipos</option>
          {Object.entries(DIVERGENCE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {selected.size > 0 && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <span className="text-sm text-blue-700 font-medium">{selected.size} item(s) selecionado(s)</span>
            <button
              onClick={() => handleBatchFix(divergences.filter((d) => selected.has(d.id)))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <Wrench className="h-3.5 w-3.5" />
              Corrigir Selecionados
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
                    {allSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Produto / SKU</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Tipo</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">ERP</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Mercado Livre</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Shopee</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Prioridade</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Ação Recomendada</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">Corrigir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-4 bg-gray-200 rounded" /></td>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-600">Nenhuma divergência encontrada</p>
                    <p className="text-xs text-gray-400 mt-1">Todos os dados estão sincronizados com o ERP</p>
                  </td>
                </tr>
              ) : (
                visible.map((div) => (
                  <tr
                    key={div.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      div.priority === 'critical' ? 'border-l-2 border-l-red-400' : ''
                    } ${selected.has(div.id) ? 'bg-blue-50/50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <button onClick={() => toggleOne(div.id)} className="text-gray-400 hover:text-blue-600">
                        {selected.has(div.id) ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm font-medium text-gray-900 leading-snug">{div.product_name}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{div.sku}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                        {DIVERGENCE_TYPE_LABELS[div.divergence_type]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-semibold text-gray-900">{div.erp_value ?? '—'}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-sm font-medium ${
                        div.ml_value && div.erp_value && div.ml_value !== div.erp_value
                          ? 'text-red-600'
                          : 'text-gray-500'
                      }`}>
                        {div.ml_value ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-sm font-medium ${
                        div.shopee_value && div.erp_value && div.shopee_value !== div.erp_value
                          ? 'text-red-600'
                          : 'text-gray-500'
                      }`}>
                        {div.shopee_value ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PriorityBadge priority={div.priority} size="sm" />
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs text-gray-600 leading-snug max-w-48">{div.recommended_action}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {div.divergence_type === 'photo' || div.divergence_type === 'description' ? (
                        <span className="text-xs text-gray-400 italic">Manual</span>
                      ) : (
                        <button
                          onClick={() => handleFixSingle(div)}
                          disabled={fixingId === div.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 whitespace-nowrap mx-auto"
                        >
                          {fixingId === div.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wrench className="h-3.5 w-3.5" />
                          )}
                          Corrigir
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && visible.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500">{visible.length} divergência(s) exibida(s)</span>
            <span className="text-xs text-gray-400">ERP é sempre a fonte oficial</span>
          </div>
        )}
      </div>

      {/* Confirm conciliar todos */}
      <ConfirmModal
        open={confirmAll}
        title="Conciliar Todos"
        message={`Foram encontradas ${visible.length} divergência(s).\n\nDeseja corrigir todas utilizando as informações do ERP (Bling)?\n\nEsta ação atualizará automaticamente Mercado Livre e Shopee.`}
        confirmLabel="Conciliar Tudo"
        cancelLabel="Cancelar"
        onConfirm={handleConciliarTodos}
        onCancel={() => setConfirmAll(false)}
        variant="warning"
      />

      {/* Progress */}
      <ProgressModal
        open={progressOpen}
        title="Conciliando divergências..."
        steps={progressSteps}
        summary={progressSummary}
        finished={progressDone}
        onClose={() => setProgressOpen(false)}
      />
    </div>
  );

  async function handleBatchFix(divs: Divergence[]) {
    const initial: ProgressStep[] = divs.map((d) => ({
      id: d.id,
      label: `${d.product_name} — ${DIVERGENCE_TYPE_LABELS[d.divergence_type]}`,
      status: 'pending',
    }));
    setProgressSteps(initial);
    setProgressSummary('');
    setProgressDone(false);
    setProgressOpen(true);

    let ok = 0; let err = 0; let skip = 0;
    for (const div of divs) {
      if (div.divergence_type === 'photo' || div.divergence_type === 'description') {
        skip++;
        setProgressSteps((prev) => prev.map((s) => s.id === div.id ? { ...s, status: 'success', detail: 'Ignorado (manual)' } : s));
        continue;
      }
      setProgressSteps((prev) => prev.map((s) => s.id === div.id ? { ...s, status: 'running' } : s));
      const res = await fixDivergence(div);
      if (res.ok) { ok++; setProgressSteps((prev) => prev.map((s) => s.id === div.id ? { ...s, status: 'success' } : s)); }
      else { err++; setProgressSteps((prev) => prev.map((s) => s.id === div.id ? { ...s, status: 'error', detail: res.error } : s)); }
    }
    setProgressSummary(`${ok} corrigido(s) · ${skip} ignorado(s) · ${err} erro(s)`);
    setProgressDone(true);
    await loadDivergences();
  }
}

async function conciliarTodosWithProgress(
  divs: Divergence[],
  onProgress: (id: string, status: 'running' | 'success' | 'error', detail?: string) => void
): Promise<ConciliationResult> {
  const t0 = Date.now();
  let updated = 0; let ignored = 0; let errors = 0;
  const details: ConciliationResult['details'] = [];

  for (const div of divs) {
    if (div.divergence_type === 'photo' || div.divergence_type === 'description') {
      ignored++;
      onProgress(div.id, 'success', 'Ignorado (manual)');
      details.push({ sku: div.sku, status: 'ignored', message: 'Requer ação manual' });
      continue;
    }
    onProgress(div.id, 'running');
    const res = await fixDivergence(div);
    if (res.ok) {
      updated++;
      onProgress(div.id, 'success');
      details.push({ sku: div.sku, status: 'success', message: div.recommended_action });
    } else {
      errors++;
      onProgress(div.id, 'error', res.error);
      details.push({ sku: div.sku, status: 'error', message: res.error ?? 'Erro' });
    }
  }
  return { updated, ignored, errors, durationMs: Date.now() - t0, details };
}

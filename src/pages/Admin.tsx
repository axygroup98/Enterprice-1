import { useEffect, useState } from 'react';
import {
  Save, CheckCircle, XCircle, Loader2, Link2,
  Database, RefreshCw, Download, Bell, ShieldCheck, PlugZap,
} from 'lucide-react';
import { getAllConfig, setConfig } from '../lib/supabase';
import { callEdgeFunction, edgeFunctionUrl } from '../lib/edge';
import { getIntegrationStatuses } from '../lib/integrations';
import { IntegrationStatus, IntegrationSource } from '../types';

interface SystemConfigState {
  audit_frequency: string;
  conciliation_auto: string;
  conciliation_frequency: string;
  export_format: string;
}

const DEFAULT_SYSTEM: SystemConfigState = {
  audit_frequency: '30',
  conciliation_auto: 'false',
  conciliation_frequency: '60',
  export_format: 'csv',
};

interface CredentialForm {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

const EMPTY_FORM: CredentialForm = { client_id: '', client_secret: '', redirect_uri: '' };

type Section = 'system';

// Aviso vindo da URL após o redirecionamento do OAuth (?bling=connected, etc.)
function useOAuthQueryNotice() {
  const [notice, setNotice] = useState<{ source: string; ok: boolean; reason?: string } | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const source of ['bling', 'mercadolivre', 'shopee', 'ml']) {
      const value = url.searchParams.get(source);
      if (value) {
        const normalized = source === 'ml' ? 'mercadolivre' : source;
        setNotice({ source: normalized, ok: value === 'connected', reason: url.searchParams.get('reason') ?? undefined });
        url.searchParams.delete(source);
        url.searchParams.delete('reason');
        window.history.replaceState({}, '', url.toString());
        break;
      }
    }
  }, []);
  return notice;
}

export function Admin() {
  const [system, setSystem] = useState<SystemConfigState>(DEFAULT_SYSTEM);
  const [originalSystem, setOriginalSystem] = useState<SystemConfigState>(DEFAULT_SYSTEM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Section | null>(null);
  const [saved, setSaved] = useState<Section | null>(null);

  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [forms, setForms] = useState<Record<'bling' | 'mercadolivre' | 'shopee', CredentialForm>>({
    bling: { ...EMPTY_FORM },
    mercadolivre: { ...EMPTY_FORM },
    shopee: { ...EMPTY_FORM },
  });
  const [credSaving, setCredSaving] = useState<string | null>(null);
  const [credSaved, setCredSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; error?: string }>>({});

  const notice = useOAuthQueryNotice();

  async function loadAll() {
    setLoading(true);
    const cfg = await getAllConfig();
    const mergedSystem: SystemConfigState = { ...DEFAULT_SYSTEM };
    for (const key of Object.keys(DEFAULT_SYSTEM) as (keyof SystemConfigState)[]) {
      if (cfg[key] !== undefined) mergedSystem[key] = cfg[key];
    }
    setSystem(mergedSystem);
    setOriginalSystem(mergedSystem);
    setStatuses(await getIntegrationStatuses());
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  function updateSystem(key: keyof SystemConfigState, value: string) {
    setSystem((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSystem() {
    setSaving('system');
    for (const key of Object.keys(system) as (keyof SystemConfigState)[]) {
      await setConfig(key, system[key]);
    }
    setOriginalSystem(system);
    setSaving(null);
    setSaved('system');
    setTimeout(() => setSaved(null), 3000);
  }

  function isSystemDirty() {
    return (Object.keys(system) as (keyof SystemConfigState)[]).some((k) => system[k] !== originalSystem[k]);
  }

  function updateForm(source: 'bling' | 'mercadolivre' | 'shopee', field: keyof CredentialForm, value: string) {
    setForms((prev) => ({ ...prev, [source]: { ...prev[source], [field]: value } }));
  }

  async function saveCredentials(source: 'bling' | 'mercadolivre' | 'shopee') {
    setCredSaving(source);
    const form = forms[source];
    await callEdgeFunction('save-credentials', {
      source,
      client_id: form.client_id || undefined,
      client_secret: form.client_secret || undefined,
      redirect_uri: form.redirect_uri || undefined,
      frontend_admin_url: window.location.origin + window.location.pathname,
    });
    setCredSaving(null);
    setCredSaved(source);
    setTimeout(() => setCredSaved(null), 3000);
    setStatuses(await getIntegrationStatuses());
  }

  function connect(source: 'bling' | 'mercadolivre' | 'shopee') {
    const fnName = source === 'bling' ? 'bling-oauth-start' : source === 'mercadolivre' ? 'ml-oauth-start' : 'shopee-oauth-start';
    window.location.href = edgeFunctionUrl(fnName);
  }

  async function testConnection(source: 'bling' | 'mercadolivre' | 'shopee') {
    setTesting(source);
    const fnName = source === 'bling' ? 'bling-api' : source === 'mercadolivre' ? 'ml-api' : 'shopee-api';
    const result = await callEdgeFunction<{ ok: boolean; error?: string; ms?: number }>(fnName, { action: 'test_connection' });
    setTestResult((prev) => ({ ...prev, [source]: { ok: result.ok, error: result.error } }));
    setTesting(null);
    setStatuses(await getIntegrationStatuses());
  }

  function statusFor(source: IntegrationSource) {
    return statuses.find((s) => s.source === source);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-900">Configurações do Sistema</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Client ID e Client Secret ficam guardados apenas no backend (Supabase Edge Functions) —
            nunca são enviados de volta ao navegador. A conexão real acontece via OAuth: clique em
            "Conectar", autorize no site oficial da integração e depois use "Testar Conexão" para
            confirmar com uma chamada real à API.
          </p>
        </div>
      </div>

      {notice && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${notice.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {notice.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {notice.ok
            ? `${notice.source} conectado com sucesso.`
            : `Falha ao conectar ${notice.source}${notice.reason ? `: ${notice.reason}` : ''}.`}
        </div>
      )}

      <IntegrationSection
        source="bling"
        title="Bling (ERP)"
        icon={Database}
        accent="blue"
        description="ERP oficial — fonte única de verdade para todos os dados"
        status={statusFor('bling')}
        form={forms.bling}
        onChange={(f, v) => updateForm('bling', f, v)}
        onSave={() => saveCredentials('bling')}
        onConnect={() => connect('bling')}
        onTest={() => testConnection('bling')}
        saving={credSaving === 'bling'}
        saved={credSaved === 'bling'}
        testing={testing === 'bling'}
        testResult={testResult.bling}
        redirectHint="Não aplicável — o Bling usa a redirect_uri cadastrada diretamente no seu App do Bling, não a informada aqui."
        showRedirectField={false}
      />

      <IntegrationSection
        source="mercadolivre"
        title="Mercado Livre"
        icon={RefreshCw}
        accent="yellow"
        description="Canal de vendas — anúncios, pedidos e estoque"
        status={statusFor('mercadolivre')}
        form={forms.mercadolivre}
        onChange={(f, v) => updateForm('mercadolivre', f, v)}
        onSave={() => saveCredentials('mercadolivre')}
        onConnect={() => connect('mercadolivre')}
        onTest={() => testConnection('mercadolivre')}
        saving={credSaving === 'mercadolivre'}
        saved={credSaved === 'mercadolivre'}
        testing={testing === 'mercadolivre'}
        testResult={testResult.mercadolivre}
        redirectHint={`Cadastre exatamente esta URL como Redirect URI no seu app do Mercado Livre: ${edgeFunctionUrl('ml-oauth-callback')}`}
        showRedirectField
      />

      <IntegrationSection
        source="shopee"
        title="Shopee"
        icon={RefreshCw}
        accent="orange"
        description="Canal de vendas — anúncios, pedidos e estoque"
        status={statusFor('shopee')}
        form={forms.shopee}
        onChange={(f, v) => updateForm('shopee', f, v)}
        onSave={() => saveCredentials('shopee')}
        onConnect={() => connect('shopee')}
        onTest={() => testConnection('shopee')}
        saving={credSaving === 'shopee'}
        saved={credSaved === 'shopee'}
        testing={testing === 'shopee'}
        testResult={testResult.shopee}
        redirectHint={`Cadastre exatamente esta URL como Redirect URL no seu app da Shopee: ${edgeFunctionUrl('shopee-oauth-callback')}`}
        showRedirectField
      />

      <Section title="Sistema" icon={Bell} description="Configurações gerais de auditoria, conciliação e exportação" accent="gray">
        <Field label="Frequência de auditoria (minutos)">
          <select
            value={system.audit_frequency}
            onChange={(e) => updateSystem('audit_frequency', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {['15', '30', '60', '120', '240'].map((v) => (
              <option key={v} value={v}>{v} minutos</option>
            ))}
          </select>
        </Field>
        <Field label="Conciliação automática">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateSystem('conciliation_auto', system.conciliation_auto === 'true' ? 'false' : 'true')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                system.conciliation_auto === 'true' ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  system.conciliation_auto === 'true' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-600">
              {system.conciliation_auto === 'true' ? 'Ativada' : 'Desativada'}
            </span>
          </div>
        </Field>
        {system.conciliation_auto === 'true' && (
          <Field label="Frequência da conciliação automática (minutos)">
            <select
              value={system.conciliation_frequency}
              onChange={(e) => updateSystem('conciliation_frequency', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['30', '60', '120', '240', '480'].map((v) => (
                <option key={v} value={v}>{v} minutos</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Formato de exportação">
          <div className="flex gap-2">
            {['csv', 'xlsx', 'json'].map((f) => (
              <button
                key={f}
                onClick={() => updateSystem('export_format', f)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  system.export_format === f
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
        <SaveBtn dirty={isSystemDirty()} saving={saving === 'system'} saved={saved === 'system'} onSave={saveSystem} />
      </Section>
    </div>
  );
}

function StatusPill({ status }: { status?: IntegrationStatus }) {
  if (!status || !status.tokenConfigured) {
    return <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500">Integração não configurada</span>;
  }
  if (status.connected) {
    return <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckCircle className="h-3 w-3" /> Conectado</span>;
  }
  return <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1 w-fit"><XCircle className="h-3 w-3" /> Não conectado</span>;
}

function IntegrationSection({
  title, icon, accent, description, status, form, onChange, onSave, onConnect, onTest,
  saving, saved, testing, testResult, redirectHint, showRedirectField,
}: {
  source: 'bling' | 'mercadolivre' | 'shopee';
  title: string;
  icon: React.ElementType;
  accent: string;
  description: string;
  status?: IntegrationStatus;
  form: CredentialForm;
  onChange: (field: keyof CredentialForm, value: string) => void;
  onSave: () => void;
  onConnect: () => void;
  onTest: () => void;
  saving: boolean;
  saved: boolean;
  testing: boolean;
  testResult?: { ok: boolean; error?: string };
  redirectHint: string;
  showRedirectField: boolean;
}) {
  const idLabel = title === 'Shopee' ? 'Partner ID' : title === 'Bling (ERP)' ? 'Client ID' : 'App ID (Client ID)';
  const secretLabel = title === 'Shopee' ? 'Partner Key' : 'Client Secret';

  return (
    <Section title={title} icon={icon} description={description} accent={accent}>
      <div className="flex items-center justify-between -mt-1 mb-1">
        <StatusPill status={status} />
      </div>

      <Field label={idLabel}>
        <input
          value={form.client_id}
          onChange={(e) => onChange('client_id', e.target.value)}
          placeholder={`Insira o ${idLabel} do ${title}`}
          autoComplete="off"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
      </Field>
      <Field label={secretLabel}>
        <input
          type="password"
          value={form.client_secret}
          onChange={(e) => onChange('client_secret', e.target.value)}
          placeholder={`Insira o ${secretLabel} do ${title}`}
          autoComplete="off"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
      </Field>
      {showRedirectField && (
        <Field label="Redirect URI">
          <input
            value={form.redirect_uri}
            onChange={(e) => onChange('redirect_uri', e.target.value)}
            placeholder="Cole aqui a mesma URL cadastrada no app do marketplace"
            autoComplete="off"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </Field>
      )}
      <p className="text-xs text-gray-500 leading-snug">{redirectHint}</p>

      <div className="flex items-center justify-end gap-3 pt-2 flex-wrap">
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle className="h-4 w-4" /> Credenciais salvas
          </span>
        )}
        {testResult && (
          <span className={`flex items-center gap-1.5 text-xs font-medium ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {testResult.ok ? 'Conexão real bem-sucedida' : (testResult.error ?? 'Falha na conexão')}
          </span>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar credenciais
        </button>
        <button
          onClick={onConnect}
          disabled={!status?.tokenConfigured}
          title={!status?.tokenConfigured ? 'Salve as credenciais antes de conectar' : ''}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Link2 className="h-4 w-4" /> Conectar
        </button>
        <button
          onClick={onTest}
          disabled={testing || !status?.tokenConfigured}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Testar Conexão
        </button>
      </div>
    </Section>
  );
}

function Section({
  title, icon: Icon, description, accent, children,
}: {
  title: string;
  icon: React.ElementType;
  description: string;
  accent: string;
  children: React.ReactNode;
}) {
  const accentClasses: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50 text-blue-700',
    yellow: 'border-yellow-500 bg-yellow-50 text-yellow-700',
    orange: 'border-orange-500 bg-orange-50 text-orange-700',
    gray: 'border-gray-400 bg-gray-50 text-gray-700',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`border-l-4 ${accentClasses[accent]} px-6 py-4`}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SaveBtn({ dirty, saving, saved, onSave }: { dirty: boolean; saving: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      {saved && (
        <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
          <CheckCircle className="h-4 w-4" /> Salvo com sucesso
        </span>
      )}
      <button
        onClick={onSave}
        disabled={!dirty || saving}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
        ) : (
          <><Save className="h-4 w-4" /> Salvar</>
        )}
      </button>
    </div>
  );
}

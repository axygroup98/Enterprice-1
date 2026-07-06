import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// system_config guarda apenas preferências NÃO sensíveis (frequência de
// auditoria, formato de exportação, etc). Credenciais e tokens vivem em
// oauth_credentials/oauth_tokens, que o navegador não consegue ler nem
// escrever (sem policy de RLS para anon/authenticated) — só as Edge
// Functions, via service_role, acessam essas tabelas.
export async function getConfig(key: string): Promise<string> {
  const { data } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? '';
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const { data } = await supabase.from('system_config').select('key, value');
  if (!data) return {};
  return Object.fromEntries(data.map((r) => [r.key, r.value ?? '']));
}

export async function setConfig(key: string, value: string): Promise<void> {
  await supabase
    .from('system_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// NOTA: inserção de sync_logs e audit_records agora é feita exclusivamente
// pelas Edge Functions (service_role) — o frontend não tem mais permissão de
// escrita nessas tabelas (só leitura), então removemos os helpers de insert
// que existiam aqui antes. Ver supabase/functions/_shared/db.ts.

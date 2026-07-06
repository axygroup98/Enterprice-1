const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function authHeaders(): Record<string, string> {
  return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
}

export function edgeFunctionUrl(name: string): string {
  return `${FUNCTIONS_URL}/${name}`;
}

export async function callEdgeFunction<T = unknown>(name: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(edgeFunctionUrl(name), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Edge Function '${name}' retornou ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
  }
  return (await res.json()) as T;
}

export async function getEdgeFunction<T = unknown>(name: string): Promise<T> {
  const res = await fetch(edgeFunctionUrl(name), { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Edge Function '${name}' retornou ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
  }
  return (await res.json()) as T;
}

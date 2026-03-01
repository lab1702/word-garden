const BASE_PATH = import.meta.env.VITE_BASE_PATH || '';
const BASE = `${BASE_PATH}/api`;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };
  if (options?.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  // CSRF defense-in-depth: custom header blocks cross-origin form submissions
  headers['X-Requested-With'] = 'XMLHttpRequest';
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

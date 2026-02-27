const BASE_URL = import.meta.env.VITE_API_URL || '';

export async function apiFetch(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    ...rest,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

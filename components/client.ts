export async function call<T = any>(url: string, body?: unknown, method = 'POST'): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Network problem. Please try again.' } as T };
  }
}

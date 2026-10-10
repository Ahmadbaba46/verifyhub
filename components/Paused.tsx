import { getService } from '@/lib/run';

/** Returns a notice when the admin has switched the service off for the web, otherwise null. */
export async function pausedNotice(key: string) {
  const s = await getService(key);
  if (!s) return null;
  if (s.enabled && s.web_enabled) return null;
  return <div className="card promo"><b>{s.label} is paused.</b> {s.paused_message}</div>;
}

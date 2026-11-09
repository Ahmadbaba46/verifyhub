import AdminServicesForm from '@/components/AdminServicesForm';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export default async function Page() {
  await requireAdmin();
  const [{ rows: services }, { rows: prices }, s] = await Promise.all([
    query(`SELECT key, label, enabled, web_enabled, telegram_enabled, paused_message FROM services ORDER BY sort, key`),
    query(`SELECT key, service_key, label, amount_kobo FROM prices ORDER BY key`),
    getSettings(),
  ]);
  return (
    <>
      <h1>Services & prices</h1>
      <p className="muted">Switch services on or off for the website and Telegram, and set what each check costs.</p>
      <AdminServicesForm
        services={services}
        prices={prices.map((p) => ({ key: p.key, serviceKey: p.service_key, label: p.label, amount: String(Number(p.amount_kobo) / 100) }))}
        minTopup={String(s.min_topup_kobo / 100)} retention={s.retention_hours} autoRefund={s.auto_refund}
      />
    </>
  );
}

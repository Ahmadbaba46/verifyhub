import WalletForm from '@/components/WalletForm';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';
import { getSettings } from '@/lib/settings';

export default async function Page() {
  const user = await requireUser();
  const s = await getSettings();
  const { rows } = await query(`SELECT kind, amount_kobo, balance_after_kobo, reference, created_at FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [user.id]);
  const tiers = s.bonus_tiers.enabled ? s.bonus_tiers.tiers : [];
  return (
    <>
      <h1>Wallet</h1>
      <p className="muted">Balance: <b>{naira(user.balance_kobo)}</b> · Minimum top-up {naira(s.min_topup_kobo)}</p>
      {tiers.length > 0 && <div className="promo">Fund {tiers.map((t) => `${naira(t.min_kobo)}+ for ${t.percent}% bonus`).join(' · ')}.</div>}
      <WalletForm mock={process.env.PAYMENT_MODE === 'mock'} presets={[1000, 2000, 5000, 10000]} />
      <div className="card">
        <h2>Recent activity</h2>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Amount</th><th>Balance</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.reference + r.created_at}><td>{new Date(r.created_at).toLocaleString('en-NG')}</td><td><span className="pill">{r.kind}</span></td><td>{r.reference}</td>
              <td>{Number(r.amount_kobo) < 0 ? '−' : '+'}{naira(Math.abs(Number(r.amount_kobo)))}</td><td>{naira(r.balance_after_kobo)}</td></tr>
          ))}</tbody>
        </table>
        {!rows.length && <p className="muted">No activity yet.</p>}
      </div>
    </>
  );
}

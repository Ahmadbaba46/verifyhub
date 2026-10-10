import { UserActions } from '@/components/AdminRowActions';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export default async function Page() {
  const me = await requireAdmin();
  const { rows } = await query(`SELECT u.id, u.name, u.email, u.status, u.tier, u.role, u.created_at, w.balance_kobo, w.total_funded_kobo
    FROM users u JOIN wallets w ON w.user_id = u.id ORDER BY u.created_at DESC LIMIT 200`);
  return (
    <>
      <h1>Users</h1>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Balance</th><th>Funded</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}><td>{u.name}{u.role === 'admin' && <> <span className="pill">admin</span></>}</td><td>{u.email}</td><td>{u.tier}</td><td>{naira(u.balance_kobo)}</td><td>{naira(u.total_funded_kobo)}</td>
              <td><span className={'pill ' + (u.status === 'active' ? '' : 'bad')}>{u.status}</span></td><td><UserActions id={u.id} status={u.status} self={u.id === me.id} /></td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

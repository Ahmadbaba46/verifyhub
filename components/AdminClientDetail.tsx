'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

type Prices = { nin: string; bvn: string; match: string; tin: string };
const SVC_LABELS: Record<string, string> = { nin: 'NIN validation', bvn: 'BVN validation', match: 'NIN & Passport match', tin: 'TIN finder' };
type Key = { id: string; name: string; env: string; display: string; allowedIps: string[]; status: string; rotated: boolean; lastUsed: string | null };
type Props = {
  id: string; name: string; email: string; status: 'pending' | 'approved' | 'suspended';
  balance: string; listPrices: Prices; agreedPrices: Prices; bonus: any;
  limits: { rpm_limit: number; max_keys: number; daily_cap: string; require_ip_allowlist: boolean; allow_test: boolean };
  note: string;
  snapshot: { requests: number; billed: number; revenue: string; discount: string };
  keys: Key[];
  blocked: { at: string; ip: string }[];
};

function ago(iso: string | null) {
  if (!iso) return 'Never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default function AdminClientDetail(p: Props) {
  const router = useRouter();
  const [prices, setPrices] = useState<Prices>(p.agreedPrices);
  const [bonusType, setBonusType] = useState<string>(p.bonus?.type ?? 'none');
  const [bonusPct, setBonusPct] = useState(String(p.bonus?.percent ?? 5));
  const [bonusMin, setBonusMin] = useState(p.bonus?.min_kobo ? String(p.bonus.min_kobo / 100) : '100000');
  const [bonusMax, setBonusMax] = useState(p.bonus?.max_kobo ? String(p.bonus.max_kobo / 100) : '');
  const [freeCount, setFreeCount] = useState(String(p.bonus?.count ?? 1000));
  const [limits, setLimits] = useState(p.limits);
  const [note, setNote] = useState(p.note);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function post(body: any, tag: string) {
    setBusy(tag); setMsg(null);
    const r = await call(`/api/admin/api-clients/${p.id}`, body);
    setBusy('');
    if (!r.ok) { setMsg({ ok: false, text: r.data.error ?? 'Action failed' }); return false; }
    router.refresh();
    return true;
  }

  async function save() {
    const bonus: any = { type: bonusType };
    if (bonusType === 'topup_percent') { bonus.percent = Number(bonusPct); bonus.min = bonusMin; bonus.max = bonusMax; }
    if (bonusType === 'free_monthly') bonus.count = Number(freeCount);
    if (await post({ action: 'save', prices, bonus, limits, note }, 'save')) setMsg({ ok: true, text: 'Saved. New rates apply to new requests.' });
  }

  async function grantCredit() {
    const amount = prompt('One-off bonus amount in ₦');
    if (!amount) return;
    const reason = prompt('Reason (kept in the audit log)');
    if (!reason) return;
    if (await post({ action: 'grant_credit', amount, reason }, 'credit')) setMsg({ ok: true, text: `Added ₦${amount} to the wallet.` });
  }

  const statusPill = p.status === 'approved' ? 'pill' : p.status === 'pending' ? 'pill warn' : 'pill bad';

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{p.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{p.email} · <span className={statusPill}>{p.status}</span></p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {p.status === 'pending' && <button className="btn" style={{ marginTop: 0 }} disabled={busy === 'approve'} onClick={() => post({ action: 'approve' }, 'approve')}>Approve access</button>}
          {p.status === 'approved' && <button className="btn danger" style={{ marginTop: 0 }} disabled={busy === 'suspend'} onClick={() => post({ action: 'suspend' }, 'suspend')}>Suspend access</button>}
          {p.status === 'suspended' && <button className="btn" style={{ marginTop: 0 }} disabled={busy === 'reactivate'} onClick={() => post({ action: 'reactivate' }, 'reactivate')}>Reactivate</button>}
        </div>
      </div>

      <div className="statrow">
        <div className="statcard"><div className="l">Requests (30d)</div><div className="n">{p.snapshot.requests.toLocaleString()}</div><div className="s">{p.snapshot.billed.toLocaleString()} billed</div></div>
        <div className="statcard"><div className="l">Revenue (30d)</div><div className="n">{p.snapshot.revenue}</div></div>
        <div className="statcard"><div className="l">Discount given</div><div className="n">{p.snapshot.discount}</div></div>
        <div className="statcard"><div className="l">Wallet</div><div className="n">{p.balance}</div></div>
      </div>

      {msg && <div className={'alert ' + (msg.ok ? 'ok' : 'err')}>{msg.text}</div>}

      <div className="card">
        <h2>Agreed pricing</h2>
        <p className="muted" style={{ marginTop: 0 }}>The price this client pays per successful request. Blank = the list price applies.</p>
        <div className="scroll">
          <table>
            <thead><tr><th>Service</th><th>List price (₦)</th><th>Agreed price (₦)</th></tr></thead>
            <tbody>
              {(['nin', 'bvn', 'match', 'tin'] as const).map((s) => (
                <tr key={s}>
                  <td><strong>{SVC_LABELS[s]}</strong></td>
                  <td className="muted">{p.listPrices[s]}</td>
                  <td><input style={{ maxWidth: 140 }} inputMode="decimal" value={prices[s]} placeholder={p.listPrices[s]} onChange={(e) => setPrices({ ...prices, [s]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Bonus</h2>
        <div className="seg">
          <label className={bonusType === 'none' ? 'on' : ''}><input type="radio" name="bt" checked={bonusType === 'none'} onChange={() => setBonusType('none')} /><span><strong>No bonus</strong></span></label>
          <label className={bonusType === 'topup_percent' ? 'on' : ''}><input type="radio" name="bt" checked={bonusType === 'topup_percent'} onChange={() => setBonusType('topup_percent')} /><span><strong>Top-up bonus</strong><br /><span className="hint">Extra credit when they fund their wallet.</span></span></label>
          <label className={bonusType === 'free_monthly' ? 'on' : ''}><input type="radio" name="bt" checked={bonusType === 'free_monthly'} onChange={() => setBonusType('free_monthly')} /><span><strong>Free requests / month</strong></span></label>
        </div>
        {bonusType === 'topup_percent' && (
          <div className="row" style={{ marginTop: 12 }}>
            <div><label>Bonus (%)</label><input inputMode="decimal" value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} /></div>
            <div><label>On top-ups of at least (₦)</label><input inputMode="decimal" value={bonusMin} onChange={(e) => setBonusMin(e.target.value)} /></div>
            <div><label>Max bonus per top-up (₦)</label><input inputMode="decimal" value={bonusMax} placeholder="no limit" onChange={(e) => setBonusMax(e.target.value)} /></div>
          </div>
        )}
        {bonusType === 'free_monthly' && (<div style={{ marginTop: 12 }}><label>Free requests each month</label><input style={{ maxWidth: 200 }} inputMode="numeric" value={freeCount} onChange={(e) => setFreeCount(e.target.value)} /></div>)}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted">Or add a one-off credit to the wallet now:</span>
          <button className="btn ghost" style={{ marginTop: 0 }} disabled={busy === 'credit'} onClick={grantCredit}>Add one-off credit</button>
        </div>
      </div>

      <div className="card">
        <h2>Safety limits</h2>
        <div className="row">
          <div><label>Max requests per minute, per key</label><input inputMode="numeric" value={limits.rpm_limit} onChange={(e) => setLimits({ ...limits, rpm_limit: Number(e.target.value) })} /></div>
          <div><label>Max keys</label><input inputMode="numeric" value={limits.max_keys} onChange={(e) => setLimits({ ...limits, max_keys: Number(e.target.value) })} /></div>
          <div><label>Daily cap ceiling per key (₦)</label><input inputMode="decimal" value={limits.daily_cap} placeholder="no ceiling" onChange={(e) => setLimits({ ...limits, daily_cap: e.target.value })} /></div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="chk" style={{ flex: '0 0 auto' }}><input type="checkbox" checked={limits.require_ip_allowlist} onChange={(e) => setLimits({ ...limits, require_ip_allowlist: e.target.checked })} />Live keys must have an IP allowlist</label>
          <label className="chk" style={{ flex: '0 0 auto' }}><input type="checkbox" checked={limits.allow_test} onChange={(e) => setLimits({ ...limits, allow_test: e.target.checked })} />Allow test keys</label>
        </div>
        <label style={{ marginTop: 12 }}>Agreement note (admins only)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Signed quote NL-2026-014" />
      </div>

      <div className="card">
        <h2>Their keys</h2>
        <p className="muted" style={{ marginTop: 0 }}>Only the first and last characters are shown. Full keys are never stored.</p>
        {p.keys.length === 0 && <p className="muted">No keys yet.</p>}
        {p.keys.length > 0 && (
          <div className="scroll">
            <table>
              <thead><tr><th>Name</th><th>Key</th><th>Type</th><th>Allowed IPs</th><th>Last used</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {p.keys.map((k) => (
                  <tr key={k.id}>
                    <td><strong>{k.name}</strong></td>
                    <td className="mono" style={{ fontSize: 13 }}>{k.display}</td>
                    <td><span className={'pill' + (k.env === 'test' ? ' warn' : '')}>{k.env}</span></td>
                    <td style={{ fontSize: 13 }}>{k.allowedIps.length ? `${k.allowedIps.length} address${k.allowedIps.length > 1 ? 'es' : ''}` : 'Any'}</td>
                    <td className="muted">{ago(k.lastUsed)}</td>
                    <td>{k.status === 'revoked' ? <span className="pill bad">revoked</span> : k.rotated ? <span className="pill warn">rotated</span> : <span className="pill">active</span>}</td>
                    <td>{k.status === 'active' && <button className="btn danger" style={{ marginTop: 0, padding: '6px 10px' }} disabled={busy === k.id} onClick={() => confirm('Revoke this key now?') && post({ action: 'revoke_key', keyId: k.id }, k.id)}>Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {p.blocked.length > 0 && (
          <div className="alert err" style={{ marginTop: 14 }}>
            <strong>Blocked requests from unlisted IPs:</strong>
            {p.blocked.map((b, i) => <div key={i}>{b.at} — {b.ip} (not charged)</div>)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
        <button className="btn" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save pricing, bonus & limits'}</button>
      </div>
    </>
  );
}

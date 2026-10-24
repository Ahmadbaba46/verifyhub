'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

type KeyRow = {
  id: string; name: string; env: 'live' | 'test'; display: string; services: string[]; allowedIps: string[];
  dailyCap: string | null; rpm: number | null; status: 'active' | 'revoked'; rotated: boolean; lastUsed: string | null;
};
type Limits = { maxKeys: number; rpmLimit: number; requireIp: boolean; allowTest: boolean; dailyCapCeil: number | null };
type Props = {
  access: 'none' | 'pending' | 'approved' | 'suspended';
  services: { key: string; label: string }[];
  keys: KeyRow[];
  limits: Limits | null;
  balance: string;
  usage: { requests: number; billed: number; spent: string } | null;
};

function ago(iso: string | null) {
  if (!iso) return 'Never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default function ApiKeysPanel({ access, services, keys, limits, balance, usage }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [fresh, setFresh] = useState<{ display: string; secret: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function requestAccess() {
    setBusy('request'); setErr('');
    const r = await call('/api/apikeys/request');
    setBusy('');
    if (!r.ok) return setErr(r.data.error ?? 'Could not send the request');
    router.refresh();
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy('create'); setErr('');
    const f = new FormData(e.currentTarget);
    const payload = {
      name: f.get('name'),
      env: f.get('env'),
      services: services.map((s) => s.key).filter((k) => f.get(`svc_${k}`) === 'on'),
      allowed_ips: String(f.get('allowed_ips') ?? '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
      daily_cap: f.get('daily_cap'),
      rpm: f.get('rpm') || undefined,
    };
    const r = await call('/api/apikeys', payload);
    setBusy('');
    if (!r.ok) return setErr(r.data.error ?? 'Could not create the key');
    setFresh({ display: r.data.display, secret: r.data.secret });
    setShowForm(false);
    router.refresh();
  }

  async function act(id: string, action: 'rotate' | 'revoke') {
    if (action === 'revoke' && !confirm('Revoke this key now? Requests using it will stop immediately.')) return;
    setBusy(id); setErr('');
    const r = await call(`/api/apikeys/${id}`, { action });
    setBusy('');
    if (!r.ok) return setErr(r.data.error ?? 'Action failed');
    if (action === 'rotate' && r.data.secret) setFresh({ display: r.data.display, secret: r.data.secret });
    router.refresh();
  }

  // --- Access not yet granted -----------------------------------------
  if (access !== 'approved') {
    return (
      <>
        <h1>API keys</h1>
        <p className="muted">Call Verify Hub from your own servers and pay per successful request from your wallet.</p>
        <div className="card">
          {access === 'none' && (
            <>
              <h2>Request API access</h2>
              <p>API access is off until an admin approves your account and agrees your per-request price. Ask for it here and we will be in touch.</p>
              <button className="btn" disabled={busy === 'request'} onClick={requestAccess}>{busy === 'request' ? 'Sending…' : 'Request API access'}</button>
            </>
          )}
          {access === 'pending' && (<><h2>Request received <span className="pill warn">Pending</span></h2><p className="muted">An admin will review your account and set your rates. You will be able to create keys once it is approved.</p></>)}
          {access === 'suspended' && (<><h2>API access suspended <span className="pill bad">Suspended</span></h2><p className="muted">Your API access is paused. Please contact support.</p></>)}
          {err && <div className="alert err">{err}</div>}
        </div>
        <div className="card"><h2>What you can do with the API</h2>
          <p className="muted">Validate a NIN, match a NIN to a passport, and find a tax ID — the same checks as the website, from your code. <Link href="/api-docs">Read the docs →</Link></p>
        </div>
      </>
    );
  }

  const activeKeys = keys.filter((k) => k.status === 'active');

  // --- Approved -------------------------------------------------------
  return (
    <>
      <h1>API keys</h1>
      <p className="muted">Each successful request is charged to your wallet at your agreed rate. <Link href="/api-docs">Read the docs →</Link></p>

      <div className="statrow">
        <div className="statcard"><div className="l">Wallet balance</div><div className="n">{balance}</div></div>
        {usage && <div className="statcard"><div className="l">Billed requests (30d)</div><div className="n">{usage.billed.toLocaleString()}</div><div className="s">{usage.requests.toLocaleString()} in total</div></div>}
        {usage && <div className="statcard"><div className="l">Spent (30d)</div><div className="n">{usage.spent}</div></div>}
        <div className="statcard"><div className="l">Active keys</div><div className="n">{activeKeys.length} of {limits?.maxKeys}</div></div>
      </div>

      {fresh && (
        <div className="reveal">
          <h2 style={{ marginBottom: 6 }}>Copy your key now</h2>
          <p className="hint" style={{ marginTop: 0 }}>This is the only time the full key is shown. We store only a one-way fingerprint, so it cannot be recovered — create a new one if you lose it.</p>
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="keybox mono" style={{ flex: '3 1 320px' }}>{fresh.secret}</div>
            <button className="btn" style={{ marginTop: 0, flex: '0 0 auto' }} onClick={() => navigator.clipboard?.writeText(fresh.secret)}>Copy</button>
          </div>
          <button className="btn ghost" onClick={() => setFresh(null)}>I have stored it</button>
        </div>
      )}

      {err && <div className="alert err">{err}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Your keys</h2>
          {!showForm && activeKeys.length < (limits?.maxKeys ?? 5) && <button className="btn" style={{ marginTop: 0 }} onClick={() => setShowForm(true)}>Create API key</button>}
        </div>
        {keys.length === 0 && <p className="muted">No keys yet. Create one to start calling the API.</p>}
        {keys.length > 0 && (
          <div className="scroll">
            <table>
              <thead><tr><th>Name</th><th>Key</th><th>Type</th><th>Services</th><th>Daily cap</th><th>Last used</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td><strong>{k.name}</strong>{k.allowedIps.length > 0 && <div className="hint">{k.allowedIps.length} allowed IP{k.allowedIps.length > 1 ? 's' : ''}</div>}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{k.display}</td>
                    <td><span className={'pill' + (k.env === 'test' ? ' warn' : '')}>{k.env}</span></td>
                    <td style={{ fontSize: 13 }}>{k.services.join(', ')}</td>
                    <td>{k.dailyCap ?? '—'}</td>
                    <td className="muted">{ago(k.lastUsed)}</td>
                    <td>{k.status === 'revoked' ? <span className="pill bad">revoked</span> : k.rotated ? <span className="pill warn">rotated</span> : <span className="pill">active</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {k.status === 'active' && !k.rotated && (
                        <>
                          <button className="btn ghost" style={{ marginTop: 0, padding: '6px 10px', marginRight: 6 }} disabled={busy === k.id} onClick={() => act(k.id, 'rotate')}>Rotate</button>
                          <button className="btn danger" style={{ marginTop: 0, padding: '6px 10px' }} disabled={busy === k.id} onClick={() => act(k.id, 'revoke')}>Revoke</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <form className="card" onSubmit={create}>
          <h2>Create an API key</h2>
          <label htmlFor="name">Key name</label>
          <input id="name" name="name" placeholder="Production server" required />
          <div className="hint">Only you and the admin see this name.</div>

          <label style={{ marginBottom: 6 }}>Type</label>
          <div className="seg">
            <label className="on"><input type="radio" name="env" value="live" defaultChecked /><span><strong>Live</strong><br /><span className="hint">Real lookups. Successful requests are charged.</span></span></label>
            {limits?.allowTest && <label><input type="radio" name="env" value="test" /><span><strong>Test</strong><br /><span className="hint">Sample people only. Free.</span></span></label>}
          </div>

          <label style={{ marginBottom: 6 }}>Services this key may call</label>
          <div className="row">
            {services.map((s) => (
              <label key={s.key} className="chk" style={{ flex: '0 0 auto' }}><input type="checkbox" name={`svc_${s.key}`} defaultChecked={s.key !== 'tin'} />{s.label}</label>
            ))}
          </div>

          <label htmlFor="allowed_ips">Allowed server IP addresses</label>
          <textarea id="allowed_ips" name="allowed_ips" rows={3} className="mono" placeholder="102.89.40.12&#10;102.89.40.13" />
          <div className="hint">One per line. Requests from any other address are rejected. {limits?.requireIp ? 'Required for live keys.' : 'Optional.'}</div>

          <div className="row">
            <div>
              <label htmlFor="daily_cap">Daily spend cap (₦)</label>
              <input id="daily_cap" name="daily_cap" inputMode="decimal" placeholder={limits?.dailyCapCeil ? `up to ${limits.dailyCapCeil.toLocaleString()}` : 'optional'} />
              <div className="hint">The key stops for the day when reached. Leave blank for no cap.</div>
            </div>
            <div>
              <label htmlFor="rpm">Requests per minute</label>
              <input id="rpm" name="rpm" inputMode="numeric" placeholder={`up to ${limits?.rpmLimit}`} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn" disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create key'}</button>
          </div>
          {err && <div className="alert err">{err}</div>}
        </form>
      )}
    </>
  );
}

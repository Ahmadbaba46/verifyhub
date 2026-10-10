'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const ref = useSearchParams().get('ref') ?? '';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const r = await call(`/api/auth/${mode}`, f);
    if (r.ok) { router.replace('/dashboard'); router.refresh(); return; }
    setErr(r.data.error ?? 'Something went wrong'); setBusy(false);
  }
  return (
    <div className="auth">
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="muted">{mode === 'login' ? 'Log in to your Verify Hub wallet.' : 'Fund a wallet once, pay only for the checks you run.'}</p>
      <form className="card" onSubmit={submit}>
        {mode === 'register' && (<><label>Full name</label><input name="name" required autoComplete="name" /><label>Phone (optional)</label><input name="phone" autoComplete="tel" /></>)}
        <label>Email</label><input name="email" type="email" required autoComplete="email" />
        <label>Password</label><input name="password" type="password" required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode === 'register' && (<><label>Referral code (optional)</label><input name="referral" defaultValue={ref} /></>)}
        {err && <div className="alert err">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <p className="muted">{mode === 'login' ? <>New here? <Link href="/register">Create an account</Link></> : <>Already registered? <Link href="/login">Log in</Link></>}</p>
    </div>
  );
}

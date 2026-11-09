'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

const FEATURES = [
  ['/dashboard', 'Dashboard'], ['/wallet', 'Wallet'], ['/nin', 'NIN validation'], ['/bvn', 'BVN validation'],
  ['/match', 'NIN & passport match'], ['/tin', 'TIN finder'], ['/api-keys', 'API keys'], ['/api-usage', 'API usage'],
  ['/api-docs', 'API docs'], ['/history', 'History'], ['/telegram', 'Telegram bot'],
];
const ADMIN = [
  ['/admin', 'Overview'], ['/admin/services', 'Services & prices'], ['/admin/api-clients', 'API clients'],
  ['/admin/api-metrics', 'API metrics'], ['/admin/users', 'Users'], ['/admin/transactions', 'Transactions'],
];

export default function Sidebar({ isAdmin, balance, name }: { isAdmin: boolean; balance: string; name: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const item = ([href, label]: string[]) => (
    <Link key={href} href={href} className={path === href ? 'on' : ''} onClick={() => setOpen(false)}>{label}</Link>
  );
  return (
    <nav className={'side' + (open ? ' open' : '')}>
      <div className="side-head">
        <div className="brand">Verify<b>Hub</b></div>
        <button type="button" className="side-toggle" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
      </div>
      <div className="side-scroll">
        {isAdmin ? (
          <>
            <div className="sec">Admin console</div>
            {ADMIN.map(item)}
            <div className="sec">Services · free for admins</div>
            {FEATURES.map(item)}
          </>
        ) : (
          FEATURES.map(item)
        )}
      </div>
      <div className="bal">
        <small>{name}</small>
        <div>{balance}</div>
        <a href="#" onClick={async (e) => { e.preventDefault(); await call('/api/auth/logout'); router.replace('/login'); router.refresh(); }}>Log out</a>
      </div>
    </nav>
  );
}

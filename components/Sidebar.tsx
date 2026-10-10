'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { call } from './client';

const USER = [['/dashboard', 'Dashboard'], ['/wallet', 'Wallet'], ['/nin', 'NIN validation'], ['/match', 'NIN & passport match'], ['/tin', 'TIN finder'], ['/history', 'History'], ['/telegram', 'Telegram bot']];
const ADMIN = [['/admin', 'Overview'], ['/admin/services', 'Services & prices'], ['/admin/users', 'Users'], ['/admin/transactions', 'Transactions']];

export default function Sidebar({ isAdmin, balance, name }: { isAdmin: boolean; balance: string; name: string }) {
  const path = usePathname();
  const router = useRouter();
  const item = ([href, label]: string[]) => (
    <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>
  );
  return (
    <nav className="side">
      <div className="brand">Verify<b>Hub</b></div>
      {USER.map(item)}
      {isAdmin && (<><div className="sec">Admin</div>{ADMIN.map(item)}</>)}
      <div className="bal"><small>{name}</small><div>{balance}</div>
        <a href="#" onClick={async (e) => { e.preventDefault(); await call('/api/auth/logout'); router.replace('/login'); router.refresh(); }}>Log out</a>
      </div>
    </nav>
  );
}

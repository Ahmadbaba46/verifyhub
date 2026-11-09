import Sidebar from '@/components/Sidebar';
import { requireUser } from '@/lib/auth';
import { naira } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <Sidebar isAdmin={user.role === 'admin'} freeChecks={user.free_checks} balance={naira(user.balance_kobo)} name={user.name} />
      <main className="main">{children}</main>
    </div>
  );
}

import BvnForm from '@/components/BvnForm';
import { pausedNotice } from '@/components/Paused';
import { requireUser } from '@/lib/auth';
import { naira } from '@/lib/money';
import { getPrice } from '@/lib/run';

export default async function Page() {
  await requireUser();
  const paused = await pausedNotice('bvn');
  return (
    <>
      <h1>BVN validation</h1>
      <p className="muted">Enter a BVN to see the linked details. Not found means no charge.</p>
      {paused ?? <BvnForm price={naira(await getPrice('bvn_validate'))} />}
    </>
  );
}

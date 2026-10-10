import NinForm from '@/components/NinForm';
import { pausedNotice } from '@/components/Paused';
import { requireUser } from '@/lib/auth';
import { naira } from '@/lib/money';
import { getPrice } from '@/lib/run';

export default async function Page() {
  await requireUser();
  const paused = await pausedNotice('nin');
  return (
    <>
      <h1>NIN validation</h1>
      <p className="muted">Enter a NIN to see the details on record. Not found means no charge.</p>
      {paused ?? <NinForm price={naira(await getPrice('nin_validate'))} slipPrice={naira(await getPrice('nin_slip'))} />}
    </>
  );
}

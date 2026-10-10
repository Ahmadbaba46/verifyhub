import { pausedNotice } from '@/components/Paused';
import TinForm from '@/components/TinForm';
import { requireUser } from '@/lib/auth';
import { naira } from '@/lib/money';
import { getPrice } from '@/lib/run';
import { getSettings } from '@/lib/settings';

export default async function Page() {
  await requireUser();
  const paused = await pausedNotice('tin');
  const s = await getSettings();
  return (
    <>
      <h1>TIN finder</h1>
      <p className="muted">Find a tax identification number by NIN or RC number. Always pick the taxpayer type.</p>
      {paused ?? <TinForm types={s.taxpayer_types} price={naira(await getPrice('tin_lookup'))} slipPrice={naira(await getPrice('tin_slip'))} certPrice={naira(await getPrice('tin_certificate'))} />}
    </>
  );
}

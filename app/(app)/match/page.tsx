import MatchForm from '@/components/MatchForm';
import { pausedNotice } from '@/components/Paused';
import { requireUser } from '@/lib/auth';
import { naira } from '@/lib/money';
import { getPrice } from '@/lib/run';

export default async function Page() {
  await requireUser();
  const paused = await pausedNotice('match');
  return (
    <>
      <h1>NIN & passport match</h1>
      <p className="muted">We look up the NIN first, then the passport, and compare the two. If either is not found you are not charged.</p>
      {paused ?? <MatchForm price={naira(await getPrice('match_check'))} />}
    </>
  );
}

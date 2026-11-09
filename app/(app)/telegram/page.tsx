import TelegramLink from '@/components/TelegramLink';
import { requireUser } from '@/lib/auth';

export default async function Page() {
  const user = await requireUser();
  const funded = user.balance_kobo > 0;
  return (
    <>
      <h1>Telegram bot</h1>
      <p className="muted">Run the same checks from Telegram. They use the same wallet and the same prices.</p>
      <div className="card">
        {user.telegram_chat_id ? <p><span className="pill">Linked</span> Your Telegram is connected. Send /start to the bot to begin.</p> : (
          <>
            {!funded && <div className="promo">Fund your wallet first. The bot only runs checks when your wallet can pay for them.</div>}
            <ol><li>Get a link code below.</li><li>Open the bot in Telegram and send the code.</li><li>Use /nin, /bvn, /match or /tin.</li></ol>
            <TelegramLink botName={process.env.TELEGRAM_BOT_USERNAME} />
          </>
        )}
      </div>
      <div className="card"><h2>Refer a friend</h2>
        <p>Your code: <b>{user.referral_code}</b></p>
        <p className="muted">Share <code>/register?ref={user.referral_code}</code>. You both earn a reward when they make their first top-up.</p>
      </div>
    </>
  );
}

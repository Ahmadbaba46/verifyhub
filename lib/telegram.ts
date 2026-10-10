import { compareIdentities } from './compare';
import { maskTail, randomCode } from './crypto';
import { query, withTx } from './db';
import { InsufficientFunds } from './ledger';
import { naira } from './money';
import { lookupNin, lookupPassport, lookupTin } from './providers';
import { assertAvailable, getPrice, getService, runPaidCheck, ServiceUnavailable } from './run';
import { getSettings } from './settings';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

export async function send(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log(`[telegram:${chatId}]`, text); // no token yet: useful in development
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('telegram send failed', res.status);
}

export async function createLinkCode(userId: string) {
  const code = randomCode('VH', 3);
  await query(`DELETE FROM telegram_link_codes WHERE user_id = $1`, [userId]);
  await query(`INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`, [code, userId]);
  return code;
}

const MENU = `What would you like to do?
/nin  NIN validation
/match  NIN & passport match
/tin  Tax ID (TIN) finder
/wallet  Balance and funding
/cancel  Stop what you are doing`;

async function setStep(chatId: number, step: string, data: Record<string, unknown> = {}) {
  await query(
    `INSERT INTO telegram_state (chat_id, step, data) VALUES ($1, $2, $3)
     ON CONFLICT (chat_id) DO UPDATE SET step = EXCLUDED.step, data = EXCLUDED.data, updated_at = now()`,
    [chatId, step, JSON.stringify(data)],
  );
}
const clearStep = (chatId: number) => query('DELETE FROM telegram_state WHERE chat_id = $1', [chatId]);

async function userForChat(chatId: number) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.status, w.balance_kobo FROM users u JOIN wallets w ON w.user_id = u.id WHERE u.telegram_chat_id = $1`,
    [chatId],
  );
  return rows[0] as { id: string; name: string; status: string; balance_kobo: string } | undefined;
}

/** Wallet must cover the price before we ask for any personal details. */
async function guardFunds(chatId: number, user: { id: string; balance_kobo: string }, serviceKey: string, priceKey: string) {
  const svc = await getService(serviceKey);
  try {
    assertAvailable(svc, 'telegram');
  } catch (e) {
    await send(chatId, (e as Error).message);
    return false;
  }
  const price = await getPrice(priceKey);
  if (Number(user.balance_kobo) < price) {
    await send(chatId, `Your wallet has ${naira(user.balance_kobo)} and this needs ${naira(price)}. Fund it here: ${appUrl()}/wallet`);
    return false;
  }
  return true;
}

async function handleLink(chatId: number, code: string) {
  const row = await withTx(async (tx) => {
    const { rows } = await tx.query(`DELETE FROM telegram_link_codes WHERE code = $1 AND expires_at > now() RETURNING user_id`, [code.toUpperCase()]);
    if (!rows.length) return null;
    // A chat can belong to one account only.
    await tx.query(`UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1`, [chatId]);
    await tx.query(`UPDATE users SET telegram_chat_id = $2 WHERE id = $1`, [rows[0].user_id, chatId]);
    return rows[0];
  });
  if (!row) return send(chatId, 'That code is invalid or has expired. Get a new one on the website under Telegram bot.');
  const u = await userForChat(chatId);
  await send(chatId, `Linked. Welcome, ${u?.name}. Wallet: ${naira(u?.balance_kobo ?? 0)}.\n\n${MENU}`);
}

export async function handleMessage(chatId: number, rawText: string) {
  const text = rawText.trim();
  const upper = text.toUpperCase();

  if (/^\/start(\s|$)/i.test(text) || /^VH-[0-9A-F]{6}$/.test(upper)) {
    const arg = text.replace(/^\/start\s*/i, '').trim();
    const candidate = /^VH-[0-9A-F]{6}$/.test(upper) ? upper : arg.toUpperCase();
    if (candidate) return handleLink(chatId, candidate);
  }

  const user = await userForChat(chatId);
  if (!user) return send(chatId, `Welcome to Verify Hub. Log in on ${appUrl()}, open "Telegram bot", then send me the code you see there.`);
  if (user.status !== 'active') return send(chatId, 'This account is suspended. Please contact support.');

  if (/^\/(start|menu|help)\b/i.test(text)) return send(chatId, `Wallet: ${naira(user.balance_kobo)}\n\n${MENU}`);
  if (/^\/cancel\b/i.test(text)) { await clearStep(chatId); return send(chatId, 'Cancelled.\n\n' + MENU); }
  if (/^\/wallet\b/i.test(text)) return send(chatId, `Wallet balance: ${naira(user.balance_kobo)}\nFund it: ${appUrl()}/wallet`);

  if (/^\/nin\b/i.test(text)) {
    if (!(await guardFunds(chatId, user, 'nin', 'nin_validate'))) return;
    const inline = text.replace(/^\/nin\s*/i, '');
    if (!inline) { await setStep(chatId, 'nin'); return send(chatId, `Send the 11-digit NIN. This costs ${naira(await getPrice('nin_validate'))}.`); }
    return runNin(chatId, user.id, inline);
  }
  if (/^\/match\b/i.test(text)) {
    if (!(await guardFunds(chatId, user, 'match', 'match_check'))) return;
    await setStep(chatId, 'match');
    return send(chatId, `Send 4 lines:\n1) NIN\n2) Date of birth on NIN (YYYY-MM-DD)\n3) Passport number\n4) Date of birth on passport (YYYY-MM-DD)\n\nThis costs ${naira(await getPrice('match_check'))}.`);
  }
  if (/^\/tin\b/i.test(text)) {
    if (!(await guardFunds(chatId, user, 'tin', 'tin_lookup'))) return;
    const types = (await getSettings()).taxpayer_types;
    await setStep(chatId, 'tin_type');
    return send(chatId, `Choose the taxpayer type (send the number):\n${types.map((t, i) => `${i + 1}) ${t}`).join('\n')}`);
  }

  const st = (await query('SELECT step, data FROM telegram_state WHERE chat_id = $1 AND updated_at > now() - interval \'15 minutes\'', [chatId])).rows[0];
  if (!st) return send(chatId, MENU);

  if (st.step === 'nin') return runNin(chatId, user.id, text);
  if (st.step === 'match') return runMatch(chatId, user.id, text);
  if (st.step === 'tin_type') {
    const types = (await getSettings()).taxpayer_types;
    const i = Number(text) - 1;
    if (!types[i]) return send(chatId, `Send a number from 1 to ${types.length}.`);
    await setStep(chatId, 'tin_id', { type: types[i] });
    return send(chatId, `Send the NIN (11 digits) or the RC number (like RC123456) for a ${types[i]}.`);
  }
  if (st.step === 'tin_id') return runTin(chatId, user.id, st.data.type, text);
  return send(chatId, MENU);
}

async function guarded(chatId: number, fn: () => Promise<string>) {
  try {
    await clearStep(chatId);
    await send(chatId, await fn());
  } catch (err) {
    if (err instanceof InsufficientFunds) return send(chatId, `Not enough balance. Fund your wallet: ${appUrl()}/wallet`);
    if (err instanceof ServiceUnavailable) return send(chatId, err.message);
    console.error(err);
    return send(chatId, 'Something went wrong. You were not charged.');
  }
}

const ymd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function runNin(chatId: number, userId: string, input: string) {
  const nin = input.replace(/\s+/g, '');
  if (!/^\d{11}$/.test(nin)) return send(chatId, 'A NIN has 11 digits. Send it again, or /cancel.');
  return guarded(chatId, async () => {
    const out = await runPaidCheck({ userId, serviceKey: 'nin', priceKey: 'nin_validate', channel: 'telegram', inputHint: `NIN ${maskTail(nin)}`, exec: () => lookupNin(nin) });
    if (out.notFound) return 'No record found for this NIN. You were not charged.';
    if (out.error) return out.error;
    const d = out.data!;
    return `NIN found (${out.reference}).\n${d.firstName} ${d.middleName} ${d.surname}\nBorn ${d.dob} · ${d.gender}\nState: ${d.stateOfOrigin ?? '-'}\n\nFor a printable slip, open ${appUrl()}/nin`;
  });
}

function runMatch(chatId: number, userId: string, input: string) {
  const [nin, ninDob, pp, ppDob] = input.split(/[\n,]+/).map((s) => s.trim());
  const ninDigits = (nin ?? '').replace(/\s+/g, '');
  if (!/^\d{11}$/.test(ninDigits) || !ymd(ninDob ?? '') || !/^[A-Za-z]\d{8}$/.test(pp ?? '') || !ymd(ppDob ?? '')) {
    return send(chatId, 'Please send exactly 4 lines: NIN, NIN date of birth, passport number, passport date of birth (dates as YYYY-MM-DD). Or /cancel.');
  }
  return guarded(chatId, async () => {
    let why = '';
    const out = await runPaidCheck({
      userId, serviceKey: 'match', priceKey: 'match_check', channel: 'telegram',
      inputHint: `NIN ${maskTail(ninDigits)} / passport ${maskTail(pp.toUpperCase())}`,
      exec: async () => {
        const n = await lookupNin(ninDigits);
        if (!n.found || n.data.dob !== ninDob) { why = 'No NIN record matches those details.'; return { found: false as const }; }
        const p = await lookupPassport(pp.toUpperCase(), ppDob);
        if (!p.found) { why = 'The NIN was found but no passport record matches.'; return { found: false as const }; }
        return { found: true as const, data: compareIdentities(n.data, p.data) };
      },
    });
    if (out.notFound) return `${why} You were not charged.`;
    if (out.error) return out.error;
    const c = out.data!;
    const head = c.verdict === 'match' ? 'All details match.' : c.verdict === 'partial' ? 'Mostly matching, 1 difference.' : 'Details do not match.';
    return `${head} (${out.reference})\n` + c.fields.map((f) => `${f.match ? '✓' : '✗'} ${f.field}: ${f.nin} / ${f.passport}`).join('\n');
  });
}

function runTin(chatId: number, userId: string, type: string, input: string) {
  const id = input.replace(/\s+/g, '').toUpperCase();
  const isNin = /^\d{11}$/.test(id);
  if (!isNin && !/^(RC)?\d{4,9}$/.test(id)) return send(chatId, 'Send an 11-digit NIN or an RC number like RC123456. Or /cancel.');
  return guarded(chatId, async () => {
    const out = await runPaidCheck({
      userId, serviceKey: 'tin', priceKey: 'tin_lookup', channel: 'telegram',
      inputHint: isNin ? `NIN ${maskTail(id)}` : `RC ${id}`,
      exec: () => lookupTin(isNin ? { nin: id, type } : { rc: id, type }),
    });
    if (out.notFound) return 'No tax ID found for those details. You were not charged.';
    if (out.error) return out.error;
    const t = out.data!;
    return `Tax ID found (${out.reference}).\nTIN: ${t.tin}\n${t.registeredName}\n${t.taxpayerType} · ${t.taxOffice} · ${t.status}\n\nFor the ${isNin ? 'slip' : 'certificate'}, open ${appUrl()}/tin`;
  });
}

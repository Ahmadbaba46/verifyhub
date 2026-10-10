import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { createFundingRequest } from '@/lib/funding';
import { parseNairaToKobo } from '@/lib/money';

const Body = z.object({ amount: z.union([z.string(), z.number()]) });

/**
 * Starts a top-up. With a real payment gateway this is where you create the gateway transaction and
 * return its checkout URL. Until you choose one, PAYMENT_MODE=mock lets you complete it with /api/wallet/mock-pay.
 */
export const POST = authed(async (req, user) => {
  const { amount } = Body.parse(await req.json());
  const kobo = parseNairaToKobo(amount);
  if (!kobo) return json({ error: 'Enter a valid amount' }, 400);
  try {
    const { reference } = await createFundingRequest(user.id, kobo);
    return json({ reference, amountKobo: kobo, mock: process.env.PAYMENT_MODE === 'mock' });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

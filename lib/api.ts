import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getUser, SessionUser } from './auth';
import { InsufficientFunds } from './ledger';
import { ServiceUnavailable } from './run';

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Browsers send an Origin header on cross-site POSTs. Reject any that does not match this host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin navigations and non-browser clients
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Handler = (req: Request, user: SessionUser) => Promise<Response>;

export function authed(handler: Handler, opts: { admin?: boolean } = {}) {
  return async (req: Request) => {
    try {
      if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
      const user = await getUser();
      if (!user) return json({ error: 'Please log in' }, 401);
      if (opts.admin && user.role !== 'admin') return json({ error: 'Not allowed' }, 403);
      return await handler(req, user);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) return json({ error: err.issues[0]?.message ?? 'Invalid input' }, 400);
  if (err instanceof InsufficientFunds) return json({ error: 'Not enough balance. Please fund your wallet.', code: 'INSUFFICIENT_FUNDS', needKobo: err.needKobo, haveKobo: err.haveKobo }, 402);
  if (err instanceof ServiceUnavailable) return json({ error: err.message, code: 'UNAVAILABLE' }, 503);
  console.error(err);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

import { authed, json } from '@/lib/api';
import { createLinkCode } from '@/lib/telegram';

export const POST = authed(async (_req, user) => json({ code: await createLinkCode(user.id) }));

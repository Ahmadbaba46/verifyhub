# Verify Hub

Wallet-based NIN validation, NIN/passport match and TIN finder, with an admin console, a Telegram bot, and a metered HTTP API for clients' servers.

## Run locally
1. Postgres running, then copy `.env.example` to `.env` and fill it in.
2. `npm install && npm run migrate && npm run seed && npm run dev`

## Deploy on Railway (one project: app + Postgres)
Variables on the app service: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SESSION_SECRET`, `RESULT_ENCRYPTION_KEY` (64 hex chars),
`ADMIN_EMAIL`, `ADMIN_PASSWORD` (10+ chars), `APP_URL`, `PAYMENT_MODE`, `PAYMENT_WEBHOOK_SECRET`.
Start command runs migrations and the admin seed on every deploy (both are safe to repeat).

## To configure before real use
- Providers: set `NIN_API_URL/KEY`, `PASSPORT_API_URL/KEY`, `TIN_API_URL/KEY` and write the response mapping where marked `TODO(provider)` in `lib/providers/index.ts`. Without them, mock data is used.
- Payments: pick a gateway, create its checkout in `/api/wallet/fund`, point its webhook at `/api/webhooks/payment`. Set `PAYMENT_MODE=live` to disable test top-ups.
- Telegram: set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, then register the webhook (see `app/api/telegram/webhook/route.ts`).

## API access (clients call from their own servers)
A client funds the same wallet and is charged per successful request at a price the admin agrees per client.

- Access is **off by default.** A user requests it on **API keys**; an admin approves it on **Admin → API clients**, sets the per-service price and any bonus, and sets safety limits.
- Keys: only a SHA-256 hash is stored (the secret is shown once). A live key can require an IP allowlist; keys carry a per-day spend cap and a per-minute rate limit, and can be rotated (24-hour grace on the old key) or revoked.
- Endpoints (bearer token, `APP_URL/v1`): `POST /v1/nin/validate`, `POST /v1/match`, `POST /v1/tin/lookup`, `GET /v1/balance`. Charged only on a 200 result; not-found, invalid, rate-limited and provider errors are free. An `Idempotency-Key` header makes retries safe (same answer, charged once) for 24 hours.
- Metrics: the client sees usage and spend on **API usage**; the admin sees platform totals, revenue by client, error reasons and upstream speed on **Admin → API metrics**.
- `APP_URL` is used as the base address shown in the in-app API docs.

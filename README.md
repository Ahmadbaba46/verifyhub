# Verify Hub

Wallet-based NIN validation, NIN/passport match and TIN finder, with an admin console and a Telegram bot.

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

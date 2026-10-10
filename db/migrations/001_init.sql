-- All money is stored in kobo (1 naira = 100 kobo) as integers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  phone         text,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  tier          text NOT NULL DEFAULT 'bronze',
  referral_code text NOT NULL UNIQUE,
  referred_by   uuid REFERENCES users(id),
  telegram_chat_id bigint UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_kobo  bigint NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),
  total_funded_kobo bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Append-only record of every balance change. Never update or delete rows.
CREATE TABLE ledger_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  kind                text NOT NULL CHECK (kind IN ('topup','bonus','charge','refund','referral','adjustment')),
  amount_kobo         bigint NOT NULL,            -- signed: credits positive, charges negative
  balance_after_kobo  bigint NOT NULL,
  reference           text NOT NULL,
  idempotency_key     text NOT NULL UNIQUE,       -- a retried request can never apply twice
  meta                jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON ledger_entries (user_id, created_at DESC);

CREATE TABLE services (
  key             text PRIMARY KEY,
  label           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  enabled         boolean NOT NULL DEFAULT true,
  web_enabled     boolean NOT NULL DEFAULT true,
  telegram_enabled boolean NOT NULL DEFAULT true,
  paused_message  text NOT NULL DEFAULT 'This service is temporarily unavailable. Your wallet has not been charged.',
  sort            int NOT NULL DEFAULT 0
);

CREATE TABLE prices (
  key          text PRIMARY KEY,
  service_key  text NOT NULL REFERENCES services(key),
  label        text NOT NULL,
  amount_kobo  bigint NOT NULL CHECK (amount_kobo >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per service run. `result_enc` holds the provider response, encrypted, until expires_at.
CREATE TABLE checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  service_key   text NOT NULL REFERENCES services(key),
  channel       text NOT NULL DEFAULT 'web' CHECK (channel IN ('web','telegram')),
  status        text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed','refunded')),
  charge_entry_id uuid REFERENCES ledger_entries(id),
  reference     text NOT NULL UNIQUE,
  input_hint    text NOT NULL DEFAULT '',          -- masked, e.g. "NIN ••••••8901"
  result_enc    text,
  error         text,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
CREATE INDEX checks_user_idx ON checks (user_id, created_at DESC);

CREATE TABLE funding_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  amount_kobo   bigint NOT NULL CHECK (amount_kobo > 0),
  provider_ref  text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);

CREATE TABLE settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES users(id),
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_link_codes (
  code        text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);

-- Seed: services, prices and settings (all editable from the admin console)
INSERT INTO services (key, label, description, sort) VALUES
  ('nin',   'NIN validation',        'Validate a NIN, view details, print a slip', 1),
  ('match', 'NIN & Passport match',  'Compare NIN and passport records', 2),
  ('tin',   'Tax ID (TIN) finder',   'Find a TIN with a NIN or RC number, then get the slip or certificate', 3);

INSERT INTO prices (key, service_key, label, amount_kobo) VALUES
  ('nin_validate', 'nin',   'NIN validation',        15000),
  ('nin_slip',     'nin',   'NIN slip',              50000),
  ('match_check',  'match', 'NIN & Passport match',  30000),
  ('tin_lookup',   'tin',   'TIN lookup',            20000),
  ('tin_slip',     'tin',   'TIN slip (NIN lookups)',100000),
  ('tin_certificate','tin', 'TIN certificate (RC)',  250000);

INSERT INTO settings (key, value) VALUES
  ('min_topup_kobo',   '50000'),
  ('retention_hours',  '24'),
  ('auto_refund',      'true'),
  ('referral',         '{"enabled":true,"reward_kobo":20000,"min_first_topup_kobo":100000,"max_rewards":20}'),
  ('bonus_tiers',      '{"enabled":true,"tiers":[{"min_kobo":500000,"percent":5},{"min_kobo":1000000,"percent":8}]}'),
  ('taxpayer_types',   '["Individual","Business name","Limited company","Partnership","NGO / association"]');

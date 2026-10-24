-- API access: clients call Verify Hub from their own servers with an API key.
-- Successful requests are charged to the same wallet, at a price the admin agrees per client.

-- A fourth channel, alongside web and telegram.
ALTER TABLE services ADD COLUMN api_enabled boolean NOT NULL DEFAULT true;

-- One row per user who has requested or been granted API access. Access is OFF until an admin approves.
CREATE TABLE api_clients (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
  rpm_limit             int NOT NULL DEFAULT 60,       -- requests per minute, per key
  max_keys              int NOT NULL DEFAULT 5,
  daily_cap_kobo        bigint,                        -- ceiling for a key's daily spend cap; null = no ceiling
  require_ip_allowlist  boolean NOT NULL DEFAULT true, -- live keys must list their server IPs
  allow_test            boolean NOT NULL DEFAULT true,
  -- {"type":"none"} | {"type":"topup_percent","percent":5,"min_kobo":10000000,"max_kobo":2500000} | {"type":"free_monthly","count":1000}
  bonus                 jsonb NOT NULL DEFAULT '{"type":"none"}',
  note                  text NOT NULL DEFAULT '',
  requested_at          timestamptz NOT NULL DEFAULT now(),
  approved_at           timestamptz,
  approved_by           uuid REFERENCES users(id)
);

-- Per-client agreed price for a service. No row => the public list price applies.
CREATE TABLE api_prices (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_key  text NOT NULL REFERENCES services(key),
  amount_kobo  bigint NOT NULL CHECK (amount_kobo >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES users(id),
  PRIMARY KEY (user_id, service_key)
);

-- An API key. Only a one-way hash is stored, so the secret cannot be read back here.
CREATE TABLE api_keys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  env            text NOT NULL CHECK (env IN ('live','test')),
  hash           text NOT NULL UNIQUE,            -- sha-256 of the full secret
  display        text NOT NULL,                   -- e.g. "vh_live_8f3a…c91d", safe to show
  services       text[] NOT NULL DEFAULT '{}',    -- which service keys this key may call
  allowed_ips    text[] NOT NULL DEFAULT '{}',    -- empty = any address
  daily_cap_kobo bigint,                          -- null = no cap of its own
  rpm_limit      int,                             -- null = client default
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  grace_until    timestamptz,                     -- a rotated key keeps working until this time
  last_used_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz
);
CREATE INDEX api_keys_user_idx ON api_keys (user_id, created_at DESC);

-- Every API call, charged or not. Drives the usage and metrics pages.
CREATE TABLE api_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      text NOT NULL UNIQUE,            -- "req_…", returned to the client
  user_id         uuid NOT NULL REFERENCES users(id),
  key_id          uuid REFERENCES api_keys(id),
  service_key     text,
  endpoint        text NOT NULL,
  idempotency_key text,
  status_code     int NOT NULL,
  outcome         text NOT NULL,                   -- ok | not_found | invalid | insufficient | ip_blocked | rate_limited | provider_error | unauthorized | forbidden
  charged_kobo    bigint NOT NULL DEFAULT 0,
  charge_entry_id uuid REFERENCES ledger_entries(id),
  duration_ms     int NOT NULL DEFAULT 0,
  ip              text,
  response_enc    text,                            -- encrypted body, kept for idempotent replay
  expires_at      timestamptz,                     -- after which the stored body is dropped
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_requests_user_idx ON api_requests (user_id, created_at DESC);
CREATE INDEX api_requests_key_idx ON api_requests (key_id, created_at DESC);
-- One answer per real-world action: a repeated idempotency key replays the first response.
CREATE UNIQUE INDEX api_requests_idem_idx ON api_requests (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

INSERT INTO settings (key, value) VALUES
  ('api', '{"rpm_limit":60,"max_keys":5,"daily_cap_kobo":null,"require_ip_allowlist":true,"allow_test":true,"idempotency_hours":24}');

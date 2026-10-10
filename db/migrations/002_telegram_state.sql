CREATE TABLE telegram_state (
  chat_id    bigint PRIMARY KEY,
  step       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Telegram retries updates; remember the ones we have handled.
CREATE TABLE telegram_updates (
  update_id  bigint PRIMARY KEY,
  seen_at    timestamptz NOT NULL DEFAULT now()
);

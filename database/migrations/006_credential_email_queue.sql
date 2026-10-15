ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS token_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS token_iv TEXT,
  ADD COLUMN IF NOT EXISTS token_tag TEXT;

DO $$ BEGIN
  CREATE TYPE credential_email_status AS ENUM ('queued', 'sending', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE credential_email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  status credential_email_status NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (badge_id, recipient)
);

CREATE INDEX credential_email_deliveries_queue_idx
  ON credential_email_deliveries (status, next_attempt_at, created_at);

CREATE INDEX credential_email_deliveries_event_idx
  ON credential_email_deliveries (event_id, created_at DESC);

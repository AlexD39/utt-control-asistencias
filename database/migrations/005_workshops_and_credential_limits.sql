ALTER TYPE scan_result ADD VALUE IF NOT EXISTS 'not_enrolled';
ALTER TYPE scan_result ADD VALUE IF NOT EXISTS 'usage_exhausted';

ALTER TABLE event_students
  ADD COLUMN IF NOT EXISTS credential_use_limit INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_students_credential_use_limit_check') THEN
    ALTER TABLE event_students ADD CONSTRAINT event_students_credential_use_limit_check
      CHECK (credential_use_limit IS NULL OR credential_use_limit > 0);
  END IF;
END $$;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS capacity INTEGER,
  ADD COLUMN IF NOT EXISTS requires_enrollment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consumes_credential_use BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE sessions
SET code = 'SES-' || UPPER(RIGHT(REPLACE(id::text, '-', ''), 8))
WHERE code IS NULL OR BTRIM(code) = '';

WITH duplicate_codes AS (
  SELECT event_id, UPPER(code) code
  FROM sessions
  GROUP BY event_id, UPPER(code)
  HAVING COUNT(*) > 1
)
UPDATE sessions s
SET code = 'SES-' || UPPER(RIGHT(REPLACE(s.id::text, '-', ''), 8))
FROM duplicate_codes d
WHERE s.event_id = d.event_id AND UPPER(s.code) = d.code;

ALTER TABLE sessions ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_session_type_check') THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_session_type_check
      CHECK (session_type IN ('general', 'workshop', 'access'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_capacity_check') THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_capacity_check
      CHECK (capacity IS NULL OR capacity > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_event_code_unique
  ON sessions (event_id, UPPER(code));

UPDATE sessions
SET session_type = 'workshop'
WHERE session_type = 'general' AND LOWER(name) LIKE 'taller %';

CREATE TABLE IF NOT EXISTS session_students (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_students_student ON session_students(student_id);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('super_admin', 'event_admin', 'scanner', 'viewer');
CREATE TYPE event_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE scan_result AS ENUM ('accepted', 'duplicate', 'invalid_badge', 'inactive_badge', 'wrong_event', 'not_enrolled', 'usage_exhausted');
CREATE TYPE credential_email_status AS ENUM ('queued', 'sending', 'sent', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'scanner',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status event_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE event_staff (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  program TEXT NOT NULL,
  photo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_students (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  credential_use_limit INTEGER CHECK (credential_use_limit IS NULL OR credential_use_limit > 0),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, student_id)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  room TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'general' CHECK (session_type IN ('general', 'workshop', 'access')),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  requires_enrollment BOOLEAN NOT NULL DEFAULT FALSE,
  consumes_credential_use BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (event_id, code),
  CHECK (ends_at > starts_at)
);

CREATE TABLE session_students (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_ciphertext TEXT,
  token_iv TEXT,
  token_tag TEXT,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  nfc_configured_at TIMESTAMPTZ,
  nfc_verified_at TIMESTAMPTZ,
  UNIQUE (event_id, student_id)
);

CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE SET NULL,
  scanned_by UUID NOT NULL REFERENCES users(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_time TIMESTAMPTZ,
  source TEXT NOT NULL CHECK (source IN ('qr', 'nfc', 'manual')),
  UNIQUE (session_id, student_id)
);

CREATE TABLE scan_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  badge_id UUID REFERENCES badges(id) ON DELETE SET NULL,
  scanned_by UUID NOT NULL REFERENCES users(id),
  result scan_result NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('qr', 'nfc', 'manual')),
  device_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX idx_sessions_event ON sessions(event_id);
CREATE INDEX idx_session_students_student ON session_students(student_id);
CREATE INDEX idx_attendances_event_time ON attendances(event_id, scanned_at DESC);
CREATE INDEX idx_attendances_session ON attendances(session_id);
CREATE INDEX idx_scan_attempts_time ON scan_attempts(created_at DESC);
CREATE INDEX idx_students_name ON students(name);
CREATE INDEX credential_email_deliveries_queue_idx ON credential_email_deliveries(status, next_attempt_at, created_at);
CREATE INDEX credential_email_deliveries_event_idx ON credential_email_deliveries(event_id, created_at DESC);

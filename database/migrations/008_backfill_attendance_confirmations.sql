-- Recupera como confirmaciones visibles los segundos escaneos históricos.
-- scan_attempt_id vuelve la operación idempotente: cada intento se convierte una sola vez.
ALTER TABLE attendances
  ADD COLUMN IF NOT EXISTS scan_attempt_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendances_scan_attempt_id_fkey'
  ) THEN
    ALTER TABLE attendances
      ADD CONSTRAINT attendances_scan_attempt_id_fkey
      FOREIGN KEY (scan_attempt_id) REFERENCES scan_attempts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendances_scan_attempt_unique
  ON attendances (scan_attempt_id)
  WHERE scan_attempt_id IS NOT NULL;

INSERT INTO attendances (
  event_id, session_id, student_id, badge_id, scanned_by,
  scanned_at, device_time, source, scan_attempt_id
)
SELECT
  sa.event_id, sa.session_id, sa.student_id, sa.badge_id, sa.scanned_by,
  sa.created_at, sa.device_time, sa.source, sa.id
FROM scan_attempts sa
WHERE sa.result = 'duplicate'
  AND sa.event_id IS NOT NULL
  AND sa.session_id IS NOT NULL
  AND sa.student_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attendances a WHERE a.scan_attempt_id = sa.id
  )
ON CONFLICT DO NOTHING;

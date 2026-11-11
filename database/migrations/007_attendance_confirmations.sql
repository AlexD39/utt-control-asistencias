-- Permite conservar la asistencia inicial y posteriores confirmaciones de permanencia.
-- La eliminación de esta restricción no modifica ni elimina registros existentes.
ALTER TABLE attendances
  DROP CONSTRAINT IF EXISTS attendances_session_id_student_id_key;

CREATE INDEX IF NOT EXISTS idx_attendances_session_student_time
  ON attendances (session_id, student_id, scanned_at);

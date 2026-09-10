INSERT INTO users (id, name, email, password_hash, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sofía Administradora', 'admin@congreso.local', crypt('Admin123!', gen_salt('bf')), 'super_admin'),
  ('10000000-0000-0000-0000-000000000002', 'Carlos Coordinador', 'coordinador@congreso.local', crypt('Admin123!', gen_salt('bf')), 'event_admin'),
  ('10000000-0000-0000-0000-000000000003', 'Mariana Registro', 'registro@congreso.local', crypt('Registro123!', gen_salt('bf')), 'scanner'),
  ('10000000-0000-0000-0000-000000000004', 'Luis Consulta', 'consulta@congreso.local', crypt('Consulta123!', gen_salt('bf')), 'viewer');

INSERT INTO events (id, name, venue, starts_at, ends_at, status) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Congreso Universitario de Innovación 2026', 'Centro de Convenciones Universitario', '2026-10-15 08:00:00-06', '2026-10-17 19:00:00-06', 'active');

INSERT INTO event_staff (event_id, user_id)
SELECT '20000000-0000-0000-0000-000000000001', id FROM users;

INSERT INTO students (id, enrollment, name, email, program) VALUES
  ('30000000-0000-0000-0000-000000000001', 'A20260001', 'Ana Martínez López', 'ana@example.edu.mx', 'Ingeniería en Sistemas'),
  ('30000000-0000-0000-0000-000000000002', 'A20260002', 'Diego Hernández Ruiz', 'diego@example.edu.mx', 'Administración'),
  ('30000000-0000-0000-0000-000000000003', 'A20260003', 'Fernanda García Soto', 'fernanda@example.edu.mx', 'Diseño Digital'),
  ('30000000-0000-0000-0000-000000000004', 'A20260004', 'Jorge Ramírez Cruz', 'jorge@example.edu.mx', 'Ingeniería Industrial'),
  ('30000000-0000-0000-0000-000000000005', 'A20260005', 'Valeria Sánchez Mora', 'valeria@example.edu.mx', 'Mercadotecnia'),
  ('30000000-0000-0000-0000-000000000006', 'A20260006', 'Emiliano Torres Vega', 'emiliano@example.edu.mx', 'Ingeniería en Sistemas');

INSERT INTO event_students (event_id, student_id)
SELECT '20000000-0000-0000-0000-000000000001', id FROM students;

INSERT INTO sessions (id, event_id, name, room, starts_at, ends_at) VALUES
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Registro general', 'Acceso principal', '2026-10-15 08:00:00-06', '2026-10-15 10:00:00-06'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Conferencia inaugural', 'Auditorio A', '2026-10-15 10:00:00-06', '2026-10-15 12:00:00-06'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Taller de inteligencia artificial', 'Laboratorio 3', '2026-10-15 13:00:00-06', '2026-10-15 15:00:00-06');

INSERT INTO badges (event_id, student_id, token_hash, label) VALUES
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', encode(digest('DEMO-ANA-7K2P', 'sha256'), 'hex'), 'Gafete 001'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', encode(digest('DEMO-DIEGO-8M4Q', 'sha256'), 'hex'), 'Gafete 002'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', encode(digest('DEMO-FER-2N9R', 'sha256'), 'hex'), 'Gafete 003'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', encode(digest('DEMO-JORGE-5T1X', 'sha256'), 'hex'), 'Gafete 004'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', encode(digest('DEMO-VALE-4C6W', 'sha256'), 'hex'), 'Gafete 005'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006', encode(digest('DEMO-EMI-3B8Z', 'sha256'), 'hex'), 'Gafete 006');

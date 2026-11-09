import assert from "node:assert/strict";
import fs from "node:fs";
import { SignJWT } from "jose";
import pg from "pg";

const { Client } = pg;

function readEnv(path) {
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
    }));
}

const env = readEnv(new URL("../.env.local", import.meta.url));
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const database = new Client({ connectionString: env.DATABASE_URL });
const suffix = Date.now().toString(36).toUpperCase();
const enrollmentPrefix = `CARGA${suffix}`;
let eventId;
let temporaryAdminId;

try {
  await database.connect();
  let adminResult = await database.query("SELECT id, name, email, role FROM users WHERE role = 'event_admin' AND active ORDER BY created_at LIMIT 1");
  if (!adminResult.rows[0]) {
    adminResult = await database.query(`INSERT INTO users (name, email, password_hash, role)
      VALUES ('Administración temporal QA', $1, 'solo-pruebas-sin-inicio-de-sesion', 'event_admin')
      RETURNING id, name, email, role`, [`qa-admin-${suffix.toLowerCase()}@example.invalid`]);
    temporaryAdminId = adminResult.rows[0].id;
  }
  const admin = adminResult.rows[0];
  const token = await new SignJWT({ name: admin.name, email: admin.email, role: admin.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.JWT_SECRET ?? "solo-desarrollo-cambia-esta-clave-insegura"));

  const event = await database.query(`INSERT INTO events (name, venue, starts_at, ends_at, status)
    VALUES ($1, 'Pruebas automatizadas', NOW(), NOW() + INTERVAL '1 day', 'draft') RETURNING id`, [`Carga de 400 alumnos ${suffix}`]);
  eventId = event.rows[0].id;

  const workshops = await database.query(`INSERT INTO sessions
    (event_id, code, name, room, starts_at, ends_at, session_type, capacity, requires_enrollment)
    VALUES
      ($1, $2, $3, 'QA-1', NOW(), NOW() + INTERVAL '1 hour', 'workshop', 500, TRUE),
      ($1, $4, $5, 'QA-2', NOW(), NOW() + INTERVAL '1 hour', 'workshop', 500, TRUE),
      ($1, $6, $7, 'QA-3', NOW(), NOW() + INTERVAL '1 hour', 'workshop', 500, TRUE),
      ($1, $8, $9, 'QA-4', NOW(), NOW() + INTERVAL '1 hour', 'workshop', 500, TRUE)
    RETURNING id, code, name`, [
    eventId,
    `QA-COMUN-1-${suffix}`, `Taller común uno ${suffix}`,
    `QA-COMUN-2-${suffix}`, `Taller común dos ${suffix}`,
    `QA-COMUN-3-${suffix}`, `Taller común tres ${suffix}`,
    `QA-INDIVIDUAL-${suffix}`, `Taller individual ${suffix}`
  ]);
  const sharedWorkshopIds = workshops.rows.filter((row) => row.code.includes("COMUN")).map((row) => row.id);
  const individualWorkshopName = workshops.rows.find((row) => row.code.includes("INDIVIDUAL")).name;

  const header = "Matrícula,Nombre,Correo,Programa,Talleres,TipoCredencial,Usos";
  const records = Array.from({ length: 400 }, (_, index) => {
    const enrollment = `${enrollmentPrefix}${String(index + 1).padStart(4, "0")}`;
    return `${enrollment},Alumno carga ${index + 1},carga${index + 1}@utt.edu.mx,Sistemas,${individualWorkshopName},limitada,5`;
  });
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("file", new Blob([[header, ...records].join("\n")], { type: "text/csv;charset=utf-8" }), "alumnos-400.csv");
  sharedWorkshopIds.forEach((id) => form.append("sharedWorkshopIds", id));
  form.set("queueEmails", "true");

  const response = await fetch(`${baseUrl}/api/students/import`, {
    method: "POST",
    headers: { cookie: `congreso_session=${token}` },
    body: form
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual({ total: body.total, created: body.created, updated: body.updated }, { total: 400, created: 400, updated: 0 });
  assert.equal(body.workshopAssignments, 1600);
  assert.equal(body.credentialsCreated, 400);
  assert.equal(body.queuedEmails, 400);

  const stored = await database.query(`SELECT COUNT(*)::int total FROM event_students es
    JOIN students s ON s.id = es.student_id WHERE es.event_id = $1 AND s.enrollment LIKE $2`, [eventId, `${enrollmentPrefix}%`]);
  assert.equal(stored.rows[0].total, 400);
  const access = await database.query(`SELECT
      (SELECT COUNT(*)::int FROM session_students ss JOIN sessions se ON se.id = ss.session_id
        JOIN students s ON s.id = ss.student_id WHERE se.event_id = $1 AND s.enrollment LIKE $2) workshop_assignments,
      (SELECT COUNT(*)::int FROM badges b JOIN students s ON s.id = b.student_id
        WHERE b.event_id = $1 AND b.active AND s.enrollment LIKE $2) credentials,
      (SELECT COUNT(*)::int FROM credential_email_deliveries d JOIN students s ON s.id = d.student_id
        WHERE d.event_id = $1 AND d.status = 'queued' AND s.enrollment LIKE $2) queued_emails`,
  [eventId, `${enrollmentPrefix}%`]);
  assert.deepEqual(access.rows[0], { workshop_assignments: 1600, credentials: 400, queued_emails: 400 });
  console.log("Carga múltiple correcta: 400 alumnos, acceso general, 4 talleres, 400 credenciales y 400 correos preparados.");
} finally {
  if (eventId) await database.query("DELETE FROM events WHERE id = $1", [eventId]).catch(() => undefined);
  await database.query("DELETE FROM students WHERE enrollment LIKE $1", [`${enrollmentPrefix}%`]).catch(() => undefined);
  if (temporaryAdminId) await database.query("DELETE FROM users WHERE id = $1", [temporaryAdminId]).catch(() => undefined);
  await database.end().catch(() => undefined);
}

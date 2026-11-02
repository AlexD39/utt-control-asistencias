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

  const header = "Matrícula,Nombre,Correo,Programa,TipoCredencial,Usos";
  const records = Array.from({ length: 400 }, (_, index) => {
    const enrollment = `${enrollmentPrefix}${String(index + 1).padStart(4, "0")}`;
    return `${enrollment},Alumno carga ${index + 1},carga${index + 1}@utt.edu.mx,Sistemas,limitada,5`;
  });
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("file", new Blob([[header, ...records].join("\n")], { type: "text/csv;charset=utf-8" }), "alumnos-400.csv");

  const response = await fetch(`${baseUrl}/api/students/import`, {
    method: "POST",
    headers: { cookie: `congreso_session=${token}` },
    body: form
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual({ total: body.total, created: body.created, updated: body.updated }, { total: 400, created: 400, updated: 0 });

  const stored = await database.query(`SELECT COUNT(*)::int total FROM event_students es
    JOIN students s ON s.id = es.student_id WHERE es.event_id = $1 AND s.enrollment LIKE $2`, [eventId, `${enrollmentPrefix}%`]);
  assert.equal(stored.rows[0].total, 400);
  console.log("Carga múltiple correcta: 400 alumnos creados por el rol Administración.");
} finally {
  if (eventId) await database.query("DELETE FROM events WHERE id = $1", [eventId]).catch(() => undefined);
  await database.query("DELETE FROM students WHERE enrollment LIKE $1", [`${enrollmentPrefix}%`]).catch(() => undefined);
  if (temporaryAdminId) await database.query("DELETE FROM users WHERE id = $1", [temporaryAdminId]).catch(() => undefined);
  await database.end().catch(() => undefined);
}

import fs from "node:fs";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import pg from "pg";

const { Client } = pg;
function readEnv(path) {
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

const env = readEnv(new URL("../.env.local", import.meta.url));
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const database = new Client({ connectionString: env.DATABASE_URL });
const suffix = Date.now().toString().slice(-8);
const enrollment = `TEST${suffix}`;
const importEnrollment = `CSV${suffix}`;
const rollbackEnrollment = `BAD${suffix}`;
const badgeCode = `TEST-ACCESS-${suffix}`;
let studentId;
let eventId;
let firstSessionId;
let secondSessionId;

async function authCookie(role) {
  const userResult = await database.query("SELECT id, name, email, role FROM users WHERE role = $1 AND active ORDER BY created_at LIMIT 1", [role]);
  const user = userResult.rows[0];
  assert.ok(user, `Falta usuario ${role}`);
  const secret = new TextEncoder().encode(env.JWT_SECRET ?? "solo-desarrollo-cambia-esta-clave-insegura");
  const token = await new SignJWT({ name: user.name, email: user.email, role: user.role }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("5m").sign(secret);
  return { user, cookie: `congreso_session=${token}` };
}

async function scan(cookie, sessionId) {
  const response = await fetch(`${baseUrl}/api/scans`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ badgeCode, sessionId, source: "qr", deviceTime: new Date().toISOString() }) });
  return { status: response.status, body: await response.json() };
}

try {
  await database.connect();
  const event = await database.query("SELECT id, starts_at, ends_at FROM events WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1");
  assert.ok(event.rows[0], "No hay congreso activo");
  eventId = event.rows[0].id;
  const scanner = await authCookie("scanner");
  const admin = await authCookie("super_admin");
  await database.query("INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [eventId, scanner.user.id]);
  const student = await database.query("INSERT INTO students (enrollment, name, program) VALUES ($1, 'Alumno Prueba Acceso', 'Sistemas') RETURNING id", [enrollment]);
  studentId = student.rows[0].id;
  await database.query("INSERT INTO event_students (event_id, student_id, credential_use_limit) VALUES ($1, $2, 1)", [eventId, studentId]);
  await database.query("INSERT INTO badges (event_id, student_id, token_hash, label) VALUES ($1, $2, encode(digest($3, 'sha256'), 'hex'), 'Prueba acceso')", [eventId, studentId, badgeCode]);
  const first = await database.query(`INSERT INTO sessions (event_id, code, name, room, starts_at, ends_at, session_type, requires_enrollment)
    VALUES ($1, $2, 'Taller prueba uno', 'QA', $3, $4, 'workshop', TRUE) RETURNING id`, [eventId, `QA-A-${suffix}`, event.rows[0].starts_at, event.rows[0].ends_at]);
  const second = await database.query(`INSERT INTO sessions (event_id, code, name, room, starts_at, ends_at, session_type, requires_enrollment)
    VALUES ($1, $2, 'Taller prueba dos', 'QA', $3, $4, 'workshop', TRUE) RETURNING id`, [eventId, `QA-B-${suffix}`, event.rows[0].starts_at, event.rows[0].ends_at]);
  firstSessionId = first.rows[0].id; secondSessionId = second.rows[0].id;
  await database.query("INSERT INTO session_students (session_id, student_id) VALUES ($1, $2)", [firstSessionId, studentId]);

  const notEnrolled = await scan(scanner.cookie, secondSessionId);
  assert.equal(notEnrolled.status, 409); assert.equal(notEnrolled.body.result, "not_enrolled");
  const accepted = await scan(scanner.cookie, firstSessionId);
  assert.equal(accepted.status, 201); assert.equal(accepted.body.result, "accepted"); assert.equal(accepted.body.credential.remainingUses, 0);
  const duplicate = await scan(scanner.cookie, firstSessionId);
  assert.equal(duplicate.status, 200); assert.equal(duplicate.body.result, "duplicate"); assert.equal(duplicate.body.credential.usesConsumed, 1);
  await database.query("INSERT INTO session_students (session_id, student_id) VALUES ($1, $2)", [secondSessionId, studentId]);
  const exhausted = await scan(scanner.cookie, secondSessionId);
  assert.equal(exhausted.status, 409); assert.equal(exhausted.body.result, "usage_exhausted");

  const validCsv = `Matrícula,Nombre,Correo,Programa,Talleres,TipoCredencial,Usos\n${importEnrollment},Alumno CSV,,Sistemas,${`QA-A-${suffix}`},limitada,2`;
  const imported = await fetch(`${baseUrl}/api/students/import`, { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ eventId, content: validCsv }) });
  const importedBody = await imported.json();
  assert.equal(imported.status, 200, JSON.stringify(importedBody)); assert.equal(importedBody.workshopAssignments, 1);
  const importedAccess = await database.query(`SELECT es.credential_use_limit, EXISTS (
    SELECT 1 FROM session_students ss JOIN sessions se ON se.id = ss.session_id
    WHERE ss.student_id = es.student_id AND se.code = $2) assigned
    FROM event_students es JOIN students s ON s.id = es.student_id WHERE es.event_id = $1 AND s.enrollment = $3`, [eventId, `QA-A-${suffix}`, importEnrollment]);
  assert.equal(importedAccess.rows[0].credential_use_limit, 2); assert.equal(importedAccess.rows[0].assigned, true);

  const invalidCsv = `Matrícula,Nombre,Programa,Talleres\n${rollbackEnrollment},Alumno Rollback,Sistemas,NO-EXISTE`;
  const invalid = await fetch(`${baseUrl}/api/students/import`, { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ eventId, content: invalidCsv }) });
  assert.equal(invalid.status, 400);
  const rolledBack = await database.query("SELECT 1 FROM students WHERE enrollment = $1", [rollbackEnrollment]);
  assert.equal(rolledBack.rowCount, 0);
  console.log("Accesos correctos: no inscrito · aceptado · duplicado sin consumo · usos agotados");
  console.log("CSV correcto: política limitada · taller asignado · rollback ante clave inválida");
} finally {
  if (eventId) {
    await database.query("DELETE FROM scan_attempts WHERE student_id = $1", [studentId]).catch(() => undefined);
    await database.query("DELETE FROM attendances WHERE student_id = $1", [studentId]).catch(() => undefined);
    await database.query("DELETE FROM students WHERE enrollment = ANY($1::text[])", [[enrollment, importEnrollment, rollbackEnrollment]]).catch(() => undefined);
    await database.query("DELETE FROM sessions WHERE id = ANY($1::uuid[])", [[firstSessionId, secondSessionId].filter(Boolean)]).catch(() => undefined);
  }
  await database.end().catch(() => undefined);
}

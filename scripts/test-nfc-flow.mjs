import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import pg from "pg";

const { Client } = pg;

function readEnv(path) {
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      return [line.slice(0, separator).trim(), value];
    }));
}

const env = readEnv(new URL("../.env.local", import.meta.url));
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const database = new Client({ connectionString: env.DATABASE_URL });
let testIdentity;
let deviceTime;
let testStudentId;

try {
  await database.connect();
  const userResult = await database.query(`SELECT DISTINCT u.id, u.name, u.email, u.role, e.id event_id
    FROM users u
    JOIN event_staff ef ON ef.user_id = u.id
    JOIN events e ON e.id = ef.event_id AND e.status = 'active'
    JOIN sessions s ON s.event_id = e.id AND s.active
    WHERE u.active AND u.role = 'scanner'
    ORDER BY u.name LIMIT 1`);
  testIdentity = userResult.rows[0];
  if (!testIdentity) throw new Error("No existe un usuario Registro asignado a una sesión activa.");

  const secret = new TextEncoder().encode(env.JWT_SECRET ?? "solo-desarrollo-cambia-esta-clave-insegura");
  const token = await new SignJWT({ name: testIdentity.name, email: testIdentity.email, role: testIdentity.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(testIdentity.id)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  const authHeaders = { cookie: `congreso_session=${token}` };

  const sessionsResponse = await fetch(`${baseUrl}/api/sessions`, { headers: authHeaders });
  const sessions = await sessionsResponse.json();
  if (!sessionsResponse.ok || !sessions.sessions?.[0]) throw new Error("El rol Registro no recibió sesiones activas.");
  const selectedSession = sessions.sessions[0];
  const suffix = Date.now().toString().slice(-8);
  const badgeCode = `UTT-NFC-TEST-${randomBytes(8).toString("hex").toUpperCase()}`;
  const created = await database.query(`INSERT INTO students (enrollment, name, email, program)
    VALUES ($1, 'Prueba NFC Temporal', $2, 'Pruebas') RETURNING id`, [`NFC${suffix}`, `nfc.${suffix}@example.edu.mx`]);
  testStudentId = created.rows[0].id;
  await database.query("INSERT INTO event_students (event_id, student_id) VALUES ($1, $2)", [testIdentity.event_id, testStudentId]);
  await database.query("INSERT INTO session_students (session_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [selectedSession.id, testStudentId]);
  await database.query(`INSERT INTO badges (event_id, student_id, token_hash, label)
    VALUES ($1, $2, encode(digest($3, 'sha256'), 'hex'), 'Credencial de prueba NFC')`, [testIdentity.event_id, testStudentId, badgeCode]);

  deviceTime = new Date().toISOString();
  const scanResponse = await fetch(`${baseUrl}/api/scans`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ badgeCode, sessionId: selectedSession.id, source: "nfc", deviceTime })
  });
  const scan = await scanResponse.json();
  if (!scanResponse.ok || !["accepted", "duplicate"].includes(scan.result)) {
    throw new Error(`La prueba de integración NFC falló (${scanResponse.status}): ${scan.message ?? scan.error}`);
  }

  console.log(`Integración NFC correcta: ${scan.result} · ${scan.student?.name ?? "alumno reconocido"}`);
  console.log(`Rol: ${testIdentity.role} · sesiones: ${sessions.sessions.length} · credencial temporal eliminada al finalizar`);
} finally {
  if (testIdentity && deviceTime) {
    await database.query("DELETE FROM scan_attempts WHERE scanned_by = $1 AND device_time = $2", [testIdentity.id, deviceTime]);
    await database.query("DELETE FROM attendances WHERE scanned_by = $1 AND device_time = $2", [testIdentity.id, deviceTime]);
  }
  if (testStudentId) await database.query("DELETE FROM students WHERE id = $1", [testStudentId]).catch(() => undefined);
  await database.end().catch(() => undefined);
}

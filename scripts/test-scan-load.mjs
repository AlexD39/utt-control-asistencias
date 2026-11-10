import fs from "node:fs";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { SignJWT } from "jose";
import pg from "pg";

const { Client } = pg;

function localEnvironment() {
  if (process.env.DATABASE_URL && process.env.JWT_SECRET) return process.env;
  const path = new URL("../.env.local", import.meta.url);
  if (!fs.existsSync(path)) throw new Error("Falta .env.local o las variables DATABASE_URL y JWT_SECRET.");
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

function percentile(values, ratio) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)] ?? 0;
}

const env = localEnvironment();
const database = new Client({ connectionString: env.DATABASE_URL });
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const studentCount = Number(process.env.LOAD_TEST_STUDENTS ?? 400);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 10);
const suffix = Date.now().toString().slice(-9);
const enrollmentPrefix = `LOAD${suffix}-`;
const badgePrefix = `LOAD-QR-${suffix}-`;
const userEmailPrefix = `load-scanner-${suffix}-`;
let eventId;
let sessionId;
let scannerIds = [];

async function sessionCookie(user) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const token = await new SignJWT({ name: user.name, email: user.email, role: "scanner" }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("15m").sign(secret);
  return `congreso_session=${token}`;
}

try {
  assert.ok(Number.isInteger(studentCount) && studentCount > 0 && studentCount <= 5000, "Cantidad de alumnos inválida");
  assert.ok(Number.isInteger(concurrency) && concurrency > 0 && concurrency <= 100, "Concurrencia inválida");
  await database.connect();
  await database.query("BEGIN");
  const event = await database.query(`INSERT INTO events (name, venue, starts_at, ends_at, status)
    VALUES ($1, 'Carga aislada', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 day', 'active') RETURNING id`, [`Prueba de carga ${suffix}`]);
  eventId = event.rows[0].id;
  const session = await database.query(`INSERT INTO sessions (event_id, code, name, room, starts_at, ends_at, session_type, requires_enrollment, consumes_credential_use)
    VALUES ($1, $2, 'Conferencia carga', 'QA', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 day', 'general', FALSE, FALSE) RETURNING id`, [eventId, `LOAD-${suffix}`]);
  sessionId = session.rows[0].id;
  const scanners = await database.query(`INSERT INTO users (name, email, password_hash, role)
    SELECT 'Registrador carga ' || n, $1 || n || '@example.invalid', 'solo-prueba-carga', 'scanner'
    FROM generate_series(1, $2::int) n RETURNING id, name, email`, [userEmailPrefix, concurrency]);
  scannerIds = scanners.rows.map((scanner) => scanner.id);
  await database.query("INSERT INTO event_staff (event_id, user_id) SELECT $1, UNNEST($2::uuid[])", [eventId, scannerIds]);
  await database.query(`INSERT INTO students (enrollment, name, program)
    SELECT $1 || LPAD(n::text, 4, '0'), 'Alumno carga ' || LPAD(n::text, 4, '0'), 'Prueba de rendimiento'
    FROM generate_series(1, $2::int) n`, [enrollmentPrefix, studentCount]);
  await database.query(`INSERT INTO event_students (event_id, student_id)
    SELECT $1, id FROM students WHERE enrollment LIKE $2`, [eventId, `${enrollmentPrefix}%`]);
  await database.query(`INSERT INTO badges (event_id, student_id, token_hash, label)
    SELECT $1, id, encode(digest($2 || REPLACE(enrollment, $3, ''), 'sha256'), 'hex'), 'Carga'
    FROM students WHERE enrollment LIKE $4`, [eventId, badgePrefix, enrollmentPrefix, `${enrollmentPrefix}%`]);
  await database.query("COMMIT");

  const cookies = await Promise.all(scanners.rows.map(sessionCookie));
  await fetch(`${baseUrl}/api/health`);
  const latencies = [];
  const results = [];
  let next = 1;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
    while (true) {
      const number = next++;
      if (number > studentCount) return;
      const badgeCode = `${badgePrefix}${String(number).padStart(4, "0")}`;
      const requestStarted = performance.now();
      try {
        const response = await fetch(`${baseUrl}/api/scans`, {
          method: "POST",
          headers: { cookie: cookies[worker], "content-type": "application/json" },
          body: JSON.stringify({ badgeCode, sessionId, source: "qr", deviceTime: new Date().toISOString() }),
        });
        const body = await response.json();
        latencies.push(performance.now() - requestStarted);
        results.push({ status: response.status, result: body.result });
      } catch (error) {
        latencies.push(performance.now() - requestStarted);
        results.push({ status: 0, result: error instanceof Error ? error.message : "network_error" });
      }
    }
  }));
  const elapsed = performance.now() - started;
  const accepted = results.filter((result) => result.status === 201 && result.result === "accepted").length;
  const errors = results.filter((result) => result.status !== 201);
  const recorded = await database.query("SELECT COUNT(*)::int total FROM attendances WHERE session_id = $1", [sessionId]);
  const summary = {
    students: studentCount,
    registrars: concurrency,
    accepted,
    errors: errors.length,
    elapsedSeconds: Number((elapsed / 1000).toFixed(2)),
    scansPerSecond: Number((studentCount / (elapsed / 1000)).toFixed(2)),
    latencyMs: {
      average: Number((latencies.reduce((total, latency) => total + latency, 0) / latencies.length).toFixed(1)),
      p50: Number(percentile(latencies, .5).toFixed(1)),
      p95: Number(percentile(latencies, .95).toFixed(1)),
      maximum: Number(Math.max(...latencies).toFixed(1)),
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) console.error("Primeros errores:", errors.slice(0, 5));
  assert.equal(results.length, studentCount, "No terminaron todas las solicitudes");
  assert.equal(errors.length, 0, "Hubo escaneos rechazados o errores de red");
  assert.equal(accepted, studentCount, "No se aceptaron todos los alumnos");
  assert.equal(recorded.rows[0].total, studentCount, "La base no guardó todas las asistencias");
  assert.ok(summary.latencyMs.p95 < 2000, `La latencia p95 fue demasiado alta: ${summary.latencyMs.p95} ms`);
} finally {
  if (database._connected) {
    await database.query("ROLLBACK").catch(() => undefined);
    if (eventId) await database.query("DELETE FROM scan_attempts WHERE event_id = $1", [eventId]).catch(() => undefined);
    if (eventId) await database.query("DELETE FROM events WHERE id = $1", [eventId]).catch(() => undefined);
    await database.query("DELETE FROM students WHERE enrollment LIKE $1", [`${enrollmentPrefix}%`]).catch(() => undefined);
    if (scannerIds.length) await database.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [scannerIds]).catch(() => undefined);
    await database.end().catch(() => undefined);
  }
}

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
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      return [line.slice(0, separator).trim(), value];
    }));
}

const env = readEnv(new URL("../.env.local", import.meta.url));
const baseUrl = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const database = new Client({ connectionString: env.DATABASE_URL });
let testIdentity;
let deviceTime;

try {
  await database.connect();
  const userResult = await database.query(`SELECT DISTINCT u.id, u.name, u.email, u.role
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

  const [sessionsResponse, badgesResponse] = await Promise.all([
    fetch(`${baseUrl}/api/sessions`, { headers: authHeaders }),
    fetch(`${baseUrl}/api/demo-badges`, { headers: authHeaders })
  ]);
  const sessions = await sessionsResponse.json();
  const badges = await badgesResponse.json();
  if (!sessionsResponse.ok || !sessions.sessions?.[0]) throw new Error("El rol Registro no recibió sesiones activas.");
  if (!badgesResponse.ok || !badges.codes?.[0]) throw new Error("No existe una credencial demo disponible.");

  deviceTime = new Date().toISOString();
  const scanResponse = await fetch(`${baseUrl}/api/scans`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      badgeCode: badges.codes[0],
      sessionId: sessions.sessions[0].id,
      source: "nfc",
      deviceTime
    })
  });
  const scan = await scanResponse.json();
  if (!scanResponse.ok || !["accepted", "duplicate"].includes(scan.result)) {
    throw new Error(`El registro NFC simulado falló (${scanResponse.status}): ${scan.message ?? scan.error}`);
  }

  console.log(`NFC simulado correcto: ${scan.result} · ${scan.student?.name ?? "alumno reconocido"}`);
  console.log(`Rol: ${testIdentity.role} · sesiones: ${sessions.sessions.length} · credenciales demo: ${badges.codes.length}`);
} finally {
  if (testIdentity && deviceTime) {
    await database.query("DELETE FROM scan_attempts WHERE scanned_by = $1 AND device_time = $2", [testIdentity.id, deviceTime]);
    await database.query("DELETE FROM attendances WHERE scanned_by = $1 AND device_time = $2", [testIdentity.id, deviceTime]);
  }
  await database.end().catch(() => undefined);
}

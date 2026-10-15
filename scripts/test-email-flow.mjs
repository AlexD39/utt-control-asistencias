import fs from "node:fs";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import pg from "pg";
import { openCredential } from "../src/lib/credential-crypto.ts";

const { Client } = pg;
function readEnv(path) {
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

const env = readEnv(new URL("../.env.local", import.meta.url));
Object.assign(process.env, env);
const baseUrl = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const database = new Client({ connectionString: env.DATABASE_URL });
const suffix = Date.now().toString().slice(-8);
let studentId;

try {
  await database.connect();
  const adminResult = await database.query("SELECT id, name, email, role FROM users WHERE role = 'super_admin' AND active ORDER BY created_at LIMIT 1");
  const admin = adminResult.rows[0];
  assert.ok(admin, "Falta un superadministrador");
  const secret = new TextEncoder().encode(env.JWT_SECRET ?? "solo-desarrollo-cambia-esta-clave-insegura");
  const token = await new SignJWT({ name: admin.name, email: admin.email, role: admin.role }).setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setIssuedAt().setExpirationTime("5m").sign(secret);
  const headers = { cookie: `congreso_session=${token}`, "content-type": "application/json" };
  const create = await fetch(`${baseUrl}/api/students`, { method: "POST", headers, body: JSON.stringify({ enrollment: `MAIL${suffix}`, name: "Prueba Correo Seguro", email: `correo.${suffix}@example.edu.mx`, program: "Pruebas", credentialType: "reusable", workshopIds: [] }) });
  const created = await create.json();
  assert.equal(create.status, 201, JSON.stringify(created));
  studentId = created.student.id;
  const badge = await database.query("SELECT token_ciphertext, token_iv, token_tag FROM badges WHERE student_id = $1", [studentId]);
  assert.ok(badge.rows[0]?.token_ciphertext, "La credencial debe quedar cifrada");
  assert.equal(openCredential({ ciphertext: badge.rows[0].token_ciphertext, iv: badge.rows[0].token_iv, tag: badge.rows[0].token_tag }), created.student.credential);
  const queue = await fetch(`${baseUrl}/api/credential-emails`, { method: "POST", headers, body: JSON.stringify({ action: "queue" }) });
  const queued = await queue.json();
  assert.equal(queue.status, 200, JSON.stringify(queued));
  const delivery = await database.query("SELECT status, recipient FROM credential_email_deliveries WHERE student_id = $1", [studentId]);
  assert.equal(delivery.rows[0]?.status, "queued");
  assert.equal(delivery.rows[0]?.recipient, `correo.${suffix}@example.edu.mx`);
  console.log("Correo correcto: token cifrado · destinatario validado · entrega en cola");
} finally {
  if (studentId) await database.query("DELETE FROM students WHERE id = $1", [studentId]).catch(() => undefined);
  await database.end().catch(() => undefined);
}

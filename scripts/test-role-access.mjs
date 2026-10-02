import fs from "node:fs";
import assert from "node:assert/strict";
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

const expectations = {
  super_admin: { "/dashboard": 200, "/scanner": 200, "/events": 200, "/students": 200, "/attendances": 200, "/users": 200, "/api/sessions": 200 },
  event_admin: { "/dashboard": 200, "/scanner": 200, "/events": 200, "/students": 200, "/attendances": 200, "/users": 307, "/api/sessions": 200 },
  scanner: { "/dashboard": 200, "/scanner": 200, "/events": 307, "/students": 307, "/attendances": 307, "/users": 307, "/api/sessions": 200 },
  viewer: { "/dashboard": 200, "/scanner": 307, "/events": 200, "/students": 200, "/attendances": 200, "/users": 307, "/api/sessions": 403 }
};

const env = readEnv(new URL("../.env.local", import.meta.url));
const baseUrl = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const database = new Client({ connectionString: env.DATABASE_URL });

try {
  await database.connect();
  const users = await database.query(`SELECT DISTINCT ON (role) id, name, email, role
    FROM users WHERE active ORDER BY role, created_at`);
  const secret = new TextEncoder().encode(env.JWT_SECRET ?? "solo-desarrollo-cambia-esta-clave-insegura");

  for (const [role, routes] of Object.entries(expectations)) {
    const user = users.rows.find((candidate) => candidate.role === role);
    assert.ok(user, `Falta un usuario activo con rol ${role}`);
    const token = await new SignJWT({ name: user.name, email: user.email, role: user.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);

    const results = [];
    for (const [path, expectedStatus] of Object.entries(routes)) {
      const response = await fetch(baseUrl + path, {
        headers: { cookie: `congreso_session=${token}` },
        redirect: "manual"
      });
      assert.equal(response.status, expectedStatus, `${role} ${path}`);
      if (response.status === 200 && !path.startsWith("/api/")) {
        const html = await response.text();
        assert.match(html, /lucide/, `${path} debe renderizar los iconos de la interfaz`);
      }
      results.push(`${path}=${response.status}`);
    }
    console.log(`${role}: ${results.join(" ")}`);
  }
} finally {
  await database.end().catch(() => undefined);
}

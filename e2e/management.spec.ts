import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { SignJWT } from "jose";
import pg from "pg";

const { Client } = pg;
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const database = new Client({ connectionString: env.DATABASE_URL });
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3101";
let sessionToken = "";
let temporaryEventId: string | undefined;

test.beforeAll(async () => {
  await database.connect();
  const userResult = await database.query("SELECT id, name, email, role FROM users WHERE role = 'super_admin' AND active ORDER BY created_at LIMIT 1");
  const user = userResult.rows[0];
  if (!user) throw new Error("Se necesita un superadministrador activo para ejecutar las pruebas E2E.");
  sessionToken = await new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(env.JWT_SECRET));

  const activeEvent = await database.query("SELECT id FROM events WHERE status = 'active' LIMIT 1");
  if (!activeEvent.rows[0]) {
    const created = await database.query(`INSERT INTO events (name, venue, starts_at, ends_at, status)
      VALUES ('Validación automatizada temporal', 'Entorno de pruebas', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 day', 'active') RETURNING id`);
    temporaryEventId = created.rows[0].id;
  }
});

test.afterAll(async () => {
  if (temporaryEventId) await database.query("DELETE FROM events WHERE id = $1", [temporaryEventId]);
  await database.end();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: "congreso_session", value: sessionToken, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
});

test("abre y cierra el registro simplificado de alumnos", async ({ page }) => {
  await page.goto("/students");
  await page.getByRole("button", { name: "Registrar alumno" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar alumno" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nombre completo")).toBeVisible();
  await expect(dialog.getByLabel("Máximo de usos")).toHaveCount(0);
  await dialog.getByLabel("Tipo de credencial").selectOption("limited");
  await expect(dialog.getByLabel("Máximo de usos")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).not.toBeVisible();
});

test("administra usuarios con modales e iconos accesibles", async ({ page }) => {
  await page.goto("/users");
  await page.getByRole("button", { name: "Agregar integrante" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo integrante" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Contraseña temporal")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("button", { name: /^Editar a / }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Cambiar contraseña de / }).first()).toBeVisible();
});

test("abre los formularios de congresos y actividades en modal", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Nuevo congreso" }).click();
  await expect(page.getByRole("dialog", { name: "Nuevo congreso" })).toBeVisible();
  await page.getByRole("dialog", { name: "Nuevo congreso" }).getByRole("button", { name: "Cancelar" }).click();
  await page.locator(".event-list-card").first().click();
  await page.getByRole("button", { name: "Nueva actividad" }).click();
  await expect(page.getByRole("dialog", { name: "Nueva actividad" })).toBeVisible();
});

test("muestra el centro de envíos y su prevalidación", async ({ page }) => {
  await page.goto("/students");
  await expect(page.getByRole("heading", { name: "Envío masivo" })).toBeVisible();
  await expect(page.getByText(/Resend (configurado|pendiente de configurar)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar pendientes" })).toBeVisible();
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@congreso.local");
  await page.getByLabel("Contraseña").fill("Admin123!");
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
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

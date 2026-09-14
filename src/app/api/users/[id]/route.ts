import { NextResponse } from "next/server";
import { getSessionUser, type Role } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { userSchema } from "@/lib/user-schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const { id } = await context.params;
  if (id === user.id && (!parsed.data.active || parsed.data.role !== "super_admin")) {
    return NextResponse.json({ error: "No puedes retirar tus propios permisos de superadministración" }, { status: 409 });
  }
  try {
    const result = await transaction(async (client) => {
      const target = await client.query<{ role: Role; active: boolean }>("SELECT role, active FROM users WHERE id = $1 FOR UPDATE", [id]);
      if (!target.rows[0]) return "NOT_FOUND";
      if (target.rows[0].role === "super_admin" && target.rows[0].active && (!parsed.data.active || parsed.data.role !== "super_admin")) {
        const admins = await client.query<{ total: string }>("SELECT COUNT(*)::text total FROM users WHERE role = 'super_admin' AND active AND id <> $1", [id]);
        if (Number(admins.rows[0].total) === 0) return "LAST_ADMIN";
      }
      await client.query("UPDATE users SET name = $1, email = $2, role = $3, active = $4, updated_at = NOW() WHERE id = $5", [parsed.data.name, parsed.data.email, parsed.data.role, parsed.data.active, id]);
      return "UPDATED";
    });
    if (result === "NOT_FOUND") return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (result === "LAST_ADMIN") return NextResponse.json({ error: "Debe permanecer al menos un superadministrador activo" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "El correo ya pertenece a otro usuario" }, { status: 409 });
    return NextResponse.json({ error: "No fue posible actualizar el usuario" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await context.params;
  if (id === user.id) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 409 });
  const result = await transaction(async (client) => {
    const target = await client.query<{ role: Role; active: boolean }>("SELECT role, active FROM users WHERE id = $1 FOR UPDATE", [id]);
    if (!target.rows[0]) return "NOT_FOUND";
    if (target.rows[0].role === "super_admin" && target.rows[0].active) {
      const admins = await client.query<{ total: string }>("SELECT COUNT(*)::text total FROM users WHERE role = 'super_admin' AND active AND id <> $1", [id]);
      if (Number(admins.rows[0].total) === 0) return "LAST_ADMIN";
    }
    const usage = await client.query<{ total: string }>(`SELECT (
      (SELECT COUNT(*) FROM attendances WHERE scanned_by = $1) +
      (SELECT COUNT(*) FROM scan_attempts WHERE scanned_by = $1)
    )::text total`, [id]);
    if (Number(usage.rows[0].total) > 0) return "IN_USE";
    await client.query("DELETE FROM users WHERE id = $1", [id]);
    return "DELETED";
  });
  if (result === "NOT_FOUND") return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (result === "LAST_ADMIN") return NextResponse.json({ error: "Debe permanecer al menos un superadministrador activo" }, { status: 409 });
  if (result === "IN_USE") return NextResponse.json({ error: "El usuario ya registró actividad y debe conservarse para auditoría. Puedes desactivarlo." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

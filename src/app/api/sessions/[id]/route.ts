import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { sessionSchema } from "@/lib/event-schemas";
import { canManageEvent } from "@/lib/event-access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await context.params;
  const current = await query<{ event_id: string; starts_at: Date; ends_at: Date }>(`SELECT s.event_id, e.starts_at, e.ends_at
    FROM sessions s JOIN events e ON e.id = s.event_id WHERE s.id = $1`, [id]);
  if (!current.rows[0]) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  if (!(await canManageEvent(user, current.rows[0].event_id))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = sessionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  if (new Date(parsed.data.startsAt) < current.rows[0].starts_at || new Date(parsed.data.endsAt) > current.rows[0].ends_at) {
    return NextResponse.json({ error: "La sesión debe quedar dentro de las fechas del congreso" }, { status: 400 });
  }
  if (parsed.data.capacity !== null) {
    const enrolled = await query<{ total: number }>("SELECT COUNT(*)::int total FROM session_students WHERE session_id = $1", [id]);
    if ((enrolled.rows[0]?.total ?? 0) > parsed.data.capacity) {
      return NextResponse.json({ error: "El cupo no puede ser menor al número de alumnos ya inscritos" }, { status: 409 });
    }
  }
  try {
    await query(`UPDATE sessions SET code = $1, name = $2, room = $3, starts_at = $4, ends_at = $5,
      session_type = $6, capacity = $7, requires_enrollment = $8, consumes_credential_use = $9, active = $10
      WHERE id = $11`, [parsed.data.code, parsed.data.name, parsed.data.room, parsed.data.startsAt,
      parsed.data.endsAt, parsed.data.sessionType, parsed.data.capacity, parsed.data.requiresEnrollment,
      parsed.data.consumesCredentialUse, parsed.data.active, id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "La clave ya pertenece a otra actividad del congreso" }, { status: 409 });
    }
    return NextResponse.json({ error: "No fue posible actualizar la actividad" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await context.params;
  const current = await query<{ event_id: string }>("SELECT event_id FROM sessions WHERE id = $1", [id]);
  if (!current.rows[0]) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  if (!(await canManageEvent(user, current.rows[0].event_id))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const result = await transaction(async (client) => {
    const usage = await client.query<{ total: string }>(`SELECT (
      (SELECT COUNT(*) FROM attendances WHERE session_id = $1) +
      (SELECT COUNT(*) FROM scan_attempts WHERE session_id = $1)
    )::text total`, [id]);
    if (Number(usage.rows[0].total) > 0) return "IN_USE";
    const deleted = await client.query("DELETE FROM sessions WHERE id = $1", [id]);
    return deleted.rowCount === 1 ? "DELETED" : "NOT_FOUND";
  });
  if (result === "IN_USE") return NextResponse.json({ error: "La sesión ya tiene registros y no puede eliminarse. Puedes desactivarla." }, { status: 409 });
  if (result === "NOT_FOUND") return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

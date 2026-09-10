import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { sessionSchema } from "@/lib/event-schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const parsed = sessionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const { id } = await context.params;
  const current = await query<{ event_id: string; starts_at: Date; ends_at: Date }>(`SELECT s.event_id, e.starts_at, e.ends_at
    FROM sessions s JOIN events e ON e.id = s.event_id WHERE s.id = $1`, [id]);
  if (!current.rows[0]) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  if (new Date(parsed.data.startsAt) < current.rows[0].starts_at || new Date(parsed.data.endsAt) > current.rows[0].ends_at) {
    return NextResponse.json({ error: "La sesión debe quedar dentro de las fechas del congreso" }, { status: 400 });
  }
  await query("UPDATE sessions SET name = $1, room = $2, starts_at = $3, ends_at = $4, active = $5 WHERE id = $6", [
    parsed.data.name, parsed.data.room, parsed.data.startsAt, parsed.data.endsAt, parsed.data.active, id
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await context.params;
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

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { eventSchema } from "@/lib/event-schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const { id } = await context.params;

  const updated = await transaction(async (client) => {
    if (parsed.data.status === "active") await client.query("SELECT pg_advisory_xact_lock(202609)");
    const current = await client.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [id]);
    if (!current.rows[0]) return "NOT_FOUND";
    const schedule = await client.query<{ first_start: Date | null; last_end: Date | null }>(
      "SELECT MIN(starts_at) first_start, MAX(ends_at) last_end FROM sessions WHERE event_id = $1",
      [id]
    );
    if ((schedule.rows[0].first_start && schedule.rows[0].first_start < new Date(parsed.data.startsAt)) ||
        (schedule.rows[0].last_end && schedule.rows[0].last_end > new Date(parsed.data.endsAt))) {
      return "OUTSIDE";
    }
    if (parsed.data.status === "active") {
      await client.query("UPDATE events SET status = 'closed' WHERE status = 'active' AND id <> $1", [id]);
    }
    await client.query(
      "UPDATE events SET name = $1, venue = $2, starts_at = $3, ends_at = $4, status = $5 WHERE id = $6 RETURNING id",
      [parsed.data.name, parsed.data.venue, parsed.data.startsAt, parsed.data.endsAt, parsed.data.status, id]
    );
    return "UPDATED";
  });
  if (updated === "OUTSIDE") return NextResponse.json({ error: "Las nuevas fechas dejarían una o más sesiones fuera del congreso" }, { status: 400 });
  if (updated === "NOT_FOUND") return NextResponse.json({ error: "Congreso no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await context.params;
  const result = await transaction(async (client) => {
    const dependencies = await client.query<{ total: string }>(`SELECT (
      (SELECT COUNT(*) FROM sessions WHERE event_id = $1) +
      (SELECT COUNT(*) FROM event_students WHERE event_id = $1) +
      (SELECT COUNT(*) FROM badges WHERE event_id = $1) +
      (SELECT COUNT(*) FROM attendances WHERE event_id = $1) +
      (SELECT COUNT(*) FROM scan_attempts WHERE event_id = $1)
    )::text total`, [id]);
    if (Number(dependencies.rows[0].total) > 0) return "IN_USE";
    const deleted = await client.query("DELETE FROM events WHERE id = $1", [id]);
    return deleted.rowCount === 1 ? "DELETED" : "NOT_FOUND";
  });
  if (result === "IN_USE") return NextResponse.json({ error: "No se puede eliminar: el congreso ya tiene alumnos, sesiones, credenciales o registros. Puedes cerrarlo." }, { status: 409 });
  if (result === "NOT_FOUND") return NextResponse.json({ error: "Congreso no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

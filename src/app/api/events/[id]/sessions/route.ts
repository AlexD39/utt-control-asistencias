import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { sessionSchema } from "@/lib/event-schemas";
import { canManageEvent } from "@/lib/event-access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id: eventId } = await context.params;
  if (!(await canManageEvent(user, eventId))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = sessionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const event = await query<{ starts_at: Date; ends_at: Date }>("SELECT starts_at, ends_at FROM events WHERE id = $1", [eventId]);
  if (!event.rows[0]) return NextResponse.json({ error: "Congreso no encontrado" }, { status: 404 });
  if (new Date(parsed.data.startsAt) < event.rows[0].starts_at || new Date(parsed.data.endsAt) > event.rows[0].ends_at) {
    return NextResponse.json({ error: "La sesión debe quedar dentro de las fechas del congreso" }, { status: 400 });
  }
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO sessions (event_id, code, name, room, starts_at, ends_at, session_type, capacity,
        requires_enrollment, consumes_credential_use, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [eventId, parsed.data.code, parsed.data.name, parsed.data.room, parsed.data.startsAt, parsed.data.endsAt,
        parsed.data.sessionType, parsed.data.capacity, parsed.data.requiresEnrollment,
        parsed.data.consumesCredentialUse, parsed.data.active]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "La clave ya pertenece a otra actividad del congreso" }, { status: 409 });
    }
    return NextResponse.json({ error: "No fue posible crear la actividad" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { sessionSchema } from "@/lib/event-schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const parsed = sessionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const { id: eventId } = await context.params;
  const event = await query<{ starts_at: Date; ends_at: Date }>("SELECT starts_at, ends_at FROM events WHERE id = $1", [eventId]);
  if (!event.rows[0]) return NextResponse.json({ error: "Congreso no encontrado" }, { status: 404 });
  if (new Date(parsed.data.startsAt) < event.rows[0].starts_at || new Date(parsed.data.endsAt) > event.rows[0].ends_at) {
    return NextResponse.json({ error: "La sesión debe quedar dentro de las fechas del congreso" }, { status: 400 });
  }
  const result = await query<{ id: string }>(
    "INSERT INTO sessions (event_id, name, room, starts_at, ends_at, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [eventId, parsed.data.name, parsed.data.room, parsed.data.startsAt, parsed.data.endsAt, parsed.data.active]
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}

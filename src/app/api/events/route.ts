import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { eventSchema } from "@/lib/event-schemas";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const result = await transaction(async (client) => {
    if (parsed.data.status === "active") {
      await client.query("SELECT pg_advisory_xact_lock(202609)");
      await client.query("UPDATE events SET status = 'closed' WHERE status = 'active'");
    }
    const event = await client.query<{ id: string }>(
      "INSERT INTO events (name, venue, starts_at, ends_at, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [parsed.data.name, parsed.data.venue, parsed.data.startsAt, parsed.data.endsAt, parsed.data.status]
    );
    await client.query("INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.rows[0].id, user.id]);
    return event.rows[0];
  });
  return NextResponse.json(result, { status: 201 });
}

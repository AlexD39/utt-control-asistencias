import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; userId: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id: eventId, userId } = await context.params;
  const removed = await query("DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2", [eventId, userId]);
  if (removed.rowCount !== 1) return NextResponse.json({ error: "El integrante no pertenece al congreso" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

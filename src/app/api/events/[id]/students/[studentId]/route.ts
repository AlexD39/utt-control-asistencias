import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-access";
import { transaction } from "@/lib/db";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; studentId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id: eventId, studentId } = await context.params;
  if (!(await canManageEvent(user, eventId))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const result = await transaction(async (client) => {
    const attendance = await client.query("SELECT 1 FROM attendances WHERE event_id = $1 AND student_id = $2 LIMIT 1", [eventId, studentId]);
    if (attendance.rows[0]) return "IN_USE";
    await client.query("UPDATE badges SET active = FALSE, revoked_at = NOW() WHERE event_id = $1 AND student_id = $2 AND active", [eventId, studentId]);
    const removed = await client.query("DELETE FROM event_students WHERE event_id = $1 AND student_id = $2", [eventId, studentId]);
    return removed.rowCount === 1 ? "REMOVED" : "NOT_FOUND";
  });
  if (result === "IN_USE") return NextResponse.json({ error: "El alumno ya tiene asistencias en este congreso y debe conservarse en el historial" }, { status: 409 });
  if (result === "NOT_FOUND") return NextResponse.json({ error: "El alumno no pertenece al congreso" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

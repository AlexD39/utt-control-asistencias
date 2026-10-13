import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-access";
import { transaction } from "@/lib/db";

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const schema = z.object({ studentIds: z.array(idSchema).max(5_000) });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin"].includes(user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id: sessionId } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "La lista de alumnos no es válida" }, { status: 400 });

  const result = await transaction(async (client) => {
    const sessionResult = await client.query<{ event_id: string; capacity: number | null }>(
      "SELECT event_id, capacity FROM sessions WHERE id = $1 FOR UPDATE",
      [sessionId]
    );
    const session = sessionResult.rows[0];
    if (!session) return { status: 404, body: { error: "Actividad no encontrada" } };
    if (!(await canManageEvent(user, session.event_id))) {
      return { status: 403, body: { error: "No autorizado" } };
    }
    const uniqueIds = [...new Set(parsed.data.studentIds)];
    if (session.capacity !== null && uniqueIds.length > session.capacity) {
      return { status: 409, body: { error: `El cupo máximo es de ${session.capacity} alumnos` } };
    }
    if (uniqueIds.length) {
      const valid = await client.query<{ id: string }>(`SELECT es.student_id id FROM event_students es
        JOIN students s ON s.id = es.student_id AND s.active
        WHERE es.event_id = $1 AND es.student_id = ANY($2::uuid[])`, [session.event_id, uniqueIds]);
      if (valid.rowCount !== uniqueIds.length) {
        return { status: 400, body: { error: "Todos los alumnos deben pertenecer al congreso y estar activos" } };
      }
    }
    await client.query("DELETE FROM session_students WHERE session_id = $1", [sessionId]);
    if (uniqueIds.length) {
      await client.query(`INSERT INTO session_students (session_id, student_id)
        SELECT $1, UNNEST($2::uuid[])`, [sessionId, uniqueIds]);
    }
    return { status: 200, body: { assigned: uniqueIds.length } };
  });

  return NextResponse.json(result.body, { status: result.status });
}

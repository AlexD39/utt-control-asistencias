import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-access";
import { query } from "@/lib/db";

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const schema = z.object({ studentIds: z.array(idSchema).min(1).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id: eventId } = await context.params;
  if (!(await canManageEvent(user, eventId))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Selecciona al menos un alumno válido" }, { status: 400 });
  const result = await query(`INSERT INTO event_students (event_id, student_id)
    SELECT $1, id FROM students WHERE id = ANY($2::uuid[]) AND active = TRUE
    ON CONFLICT DO NOTHING RETURNING student_id`, [eventId, parsed.data.studentIds]);
  return NextResponse.json({ assigned: result.rowCount });
}

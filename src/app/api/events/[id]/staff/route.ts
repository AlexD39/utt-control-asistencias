import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const schema = z.object({ userIds: z.array(idSchema).min(1).max(100) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Selecciona al menos un integrante válido" }, { status: 400 });
  const { id: eventId } = await context.params;
  const result = await query(`INSERT INTO event_staff (event_id, user_id)
    SELECT $1, id FROM users WHERE id = ANY($2::uuid[]) AND active = TRUE
      AND EXISTS (SELECT 1 FROM events WHERE id = $1)
    ON CONFLICT DO NOTHING RETURNING user_id`, [eventId, parsed.data.userIds]);
  return NextResponse.json({ assigned: result.rowCount });
}

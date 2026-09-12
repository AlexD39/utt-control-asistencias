import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const result = await query(`SELECT s.id, s.event_id, s.name, s.room, s.starts_at, s.ends_at
    FROM sessions s JOIN events e ON e.id = s.event_id
    WHERE s.active AND e.status = 'active' AND ($1::boolean OR EXISTS (
      SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2
    )) ORDER BY s.starts_at`, [user.role === "super_admin", user.id]);
  return NextResponse.json({ sessions: result.rows });
}

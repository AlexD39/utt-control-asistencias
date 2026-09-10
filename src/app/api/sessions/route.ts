import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const result = await query(`SELECT s.id, s.event_id, s.name, s.room, s.starts_at, s.ends_at
    FROM sessions s JOIN events e ON e.id = s.event_id
    WHERE s.active AND e.status = 'active' ORDER BY s.starts_at`);
  return NextResponse.json({ sessions: result.rows });
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const result = await query("SELECT id, event_id, name, room, starts_at, ends_at FROM sessions WHERE active ORDER BY starts_at");
  return NextResponse.json({ sessions: result.rows });
}


import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-access";
import { query } from "@/lib/db";

const schema = z.object({ status: z.enum(["written", "verified"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Estado NFC inválido" }, { status: 400 });
  const { id: studentId } = await context.params;
  const badge = await query<{ id: string; event_id: string }>(`SELECT b.id, b.event_id FROM badges b JOIN events e ON e.id = b.event_id
    WHERE b.student_id = $1 AND b.active AND e.status = 'active' ORDER BY b.issued_at DESC LIMIT 1`, [studentId]);
  if (!badge.rows[0]) return NextResponse.json({ error: "No existe una credencial activa para este alumno" }, { status: 404 });
  if (!(await canManageEvent(user, badge.rows[0].event_id))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (parsed.data.status === "verified") {
    await query("UPDATE badges SET nfc_configured_at = COALESCE(nfc_configured_at, NOW()), nfc_verified_at = NOW() WHERE id = $1", [badge.rows[0].id]);
  } else {
    await query("UPDATE badges SET nfc_configured_at = NOW(), nfc_verified_at = NULL WHERE id = $1", [badge.rows[0].id]);
  }
  return NextResponse.json({ ok: true });
}

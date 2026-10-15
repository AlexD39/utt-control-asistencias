import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { generateBadgeCode } from "@/lib/badges";
import { sealCredential } from "@/lib/credential-crypto";
import { query, transaction } from "@/lib/db";
import { canManageEvent } from "@/lib/event-access";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await context.params;
  const activeEvent = await query<{ id: string }>("SELECT id FROM events WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1");
  if (!activeEvent.rows[0]) return NextResponse.json({ error: "No existe un congreso activo" }, { status: 409 });
  if (!(await canManageEvent(user, activeEvent.rows[0].id))) return NextResponse.json({ error: "No tienes acceso al congreso activo" }, { status: 403 });
  const credential = generateBadgeCode();
  const sealed = sealCredential(credential);
  const student = await transaction(async (client) => {
    const found = await client.query<{ id: string; name: string; enrollment: string; program: string; event_id: string | null; credential_use_limit: number | null }>(
      "SELECT s.id, s.name, s.enrollment, s.program, es.event_id, es.credential_use_limit FROM students s JOIN event_students es ON es.student_id = s.id WHERE s.id = $1 AND es.event_id = $2 AND s.active = TRUE LIMIT 1",
      [id, activeEvent.rows[0].id]
    );
    const row = found.rows[0];
    if (!row || !row.event_id) return null;
    await client.query(`DELETE FROM credential_email_deliveries WHERE badge_id IN (
      SELECT id FROM badges WHERE event_id = $1 AND student_id = $2
    )`, [row.event_id, row.id]);
    const sql = "INSERT INTO badges (event_id, student_id, token_hash, token_ciphertext, token_iv, token_tag, label, active) " +
      "VALUES ($1, $2, encode(digest($3, 'sha256'), 'hex'), $4, $5, $6, $7, TRUE) " +
      "ON CONFLICT (event_id, student_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, token_ciphertext = EXCLUDED.token_ciphertext, token_iv = EXCLUDED.token_iv, token_tag = EXCLUDED.token_tag, label = EXCLUDED.label, active = TRUE, revoked_at = NULL, issued_at = NOW(), nfc_configured_at = NULL, nfc_verified_at = NULL";
    await client.query(sql, [row.event_id, row.id, credential, sealed.ciphertext, sealed.iv, sealed.tag, `Credencial ${row.enrollment}`]);
    return row;
  });
  if (!student) return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });
  return NextResponse.json({ student: { ...student, credential, credentialUseLimit: student.credential_use_limit } });
}

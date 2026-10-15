import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { openCredential } from "@/lib/credential-crypto";
import { transaction, query } from "@/lib/db";
import { sendCredentialEmail } from "@/lib/email-provider";

type Delivery = {
  id: string; recipient: string; attempts: number; student_name: string; enrollment: string; program: string; event_name: string;
  token_ciphertext: string; token_iv: string; token_tag: string;
};

export async function POST(request: Request) {
  const workerKey = request.headers.get("x-email-worker-key");
  const isWorker = Boolean(workerKey && process.env.EMAIL_WORKER_KEY && workerKey === process.env.EMAIL_WORKER_KEY);
  const user = isWorker ? { role: "worker", id: "worker" } : await getSessionUser();
  if (!user || !["worker", "super_admin", "event_admin"].includes(user.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  let eventId: string | null = null;
  if (!isWorker) {
    const event = await query<{ id: string }>(`SELECT e.id FROM events e WHERE e.status = 'active'
      AND ($1::boolean OR EXISTS (SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2))
      ORDER BY e.starts_at DESC LIMIT 1`, [user.role === "super_admin", user.id]);
    eventId = event.rows[0]?.id ?? null;
    if (!eventId) return NextResponse.json({ error: "No existe un congreso activo disponible" }, { status: 409 });
  }
  await query(`UPDATE credential_email_deliveries SET status = 'queued', updated_at = NOW()
    WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes' AND ($1::uuid IS NULL OR event_id = $1)`, [eventId]);
  const delivery = await transaction(async (client) => {
    const result = await client.query<Delivery>(`SELECT d.id, d.recipient, d.attempts, s.name student_name, s.enrollment, s.program, e.name event_name,
      b.token_ciphertext, b.token_iv, b.token_tag
      FROM credential_email_deliveries d JOIN students s ON s.id = d.student_id JOIN events e ON e.id = d.event_id JOIN badges b ON b.id = d.badge_id
      WHERE d.status = 'queued' AND d.next_attempt_at <= NOW() AND d.attempts < d.max_attempts
      AND ($1::uuid IS NULL OR d.event_id = $1)
      ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1`, [eventId]);
    const row = result.rows[0];
    if (!row) return null;
    await client.query("UPDATE credential_email_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = NOW() WHERE id = $1", [row.id]);
    return row;
  });
  if (!delivery) return NextResponse.json({ processed: false });
  try {
    const credential = openCredential({ ciphertext: delivery.token_ciphertext, iv: delivery.token_iv, tag: delivery.token_tag });
    const sent = await sendCredentialEmail({ to: delivery.recipient, studentName: delivery.student_name, enrollment: delivery.enrollment, program: delivery.program, eventName: delivery.event_name, credential });
    await query(`UPDATE credential_email_deliveries SET status = 'sent', provider = $1, provider_message_id = $2,
      last_error = NULL, sent_at = NOW(), updated_at = NOW() WHERE id = $3`, [sent.provider, sent.messageId, delivery.id]);
    return NextResponse.json({ processed: true, status: "sent", recipient: delivery.recipient });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Error desconocido";
    const attempts = delivery.attempts + 1;
    const failed = attempts >= 5;
    await query(`UPDATE credential_email_deliveries SET status = $1, last_error = $2,
      next_attempt_at = NOW() + ($3::text || ' minutes')::interval, updated_at = NOW() WHERE id = $4`,
      [failed ? "failed" : "queued", message, Math.min(60, 2 ** attempts), delivery.id]);
    return NextResponse.json({ processed: true, status: failed ? "failed" : "queued", error: message }, { status: 502 });
  }
}

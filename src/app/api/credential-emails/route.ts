import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { resendConfiguration } from "@/lib/email-provider";

async function activeEvent(user: { id: string; role: string }) {
  const result = await query<{ id: string; name: string }>(`SELECT e.id, e.name FROM events e
    WHERE e.status = 'active' AND ($1::boolean OR EXISTS (
      SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2
    )) ORDER BY e.starts_at DESC LIMIT 1`, [user.role === "super_admin", user.id]);
  return result.rows[0];
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin"].includes(user.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const event = await activeEvent(user);
  if (!event) return NextResponse.json({ error: "No existe un congreso activo" }, { status: 409 });
  const [availability, statuses, recent] = await Promise.all([
    query<{ total: number; eligible: number; missing_email: number; missing_token: number }>(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE s.email IS NOT NULL AND BTRIM(s.email) <> '' AND b.token_ciphertext IS NOT NULL)::int eligible,
      COUNT(*) FILTER (WHERE s.email IS NULL OR BTRIM(s.email) = '')::int missing_email,
      COUNT(*) FILTER (WHERE b.token_ciphertext IS NULL)::int missing_token
      FROM event_students es JOIN students s ON s.id = es.student_id AND s.active
      LEFT JOIN badges b ON b.event_id = es.event_id AND b.student_id = s.id AND b.active
      WHERE es.event_id = $1`, [event.id]),
    query<{ status: string; total: number }>(`SELECT status::text, COUNT(*)::int total FROM credential_email_deliveries
      WHERE event_id = $1 GROUP BY status`, [event.id]),
    query<{ id: string; recipient: string; status: string; attempts: number; last_error: string | null; sent_at: Date | null; student_name: string }>(`SELECT d.id, d.recipient, d.status::text, d.attempts, d.last_error, d.sent_at, s.name student_name
      FROM credential_email_deliveries d JOIN students s ON s.id = d.student_id
      WHERE d.event_id = $1 ORDER BY d.updated_at DESC LIMIT 12`, [event.id])
  ]);
  return NextResponse.json({ event, availability: availability.rows[0], statuses: Object.fromEntries(statuses.rows.map((row) => [row.status, row.total])), recent: recent.rows, provider: "resend", providerConfigured: resendConfiguration().configured });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin"].includes(user.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const event = await activeEvent(user);
  if (!event) return NextResponse.json({ error: "No existe un congreso activo" }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === "retry") {
    const result = await query(`UPDATE credential_email_deliveries SET status = 'queued', next_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE event_id = $1 AND status = 'failed' RETURNING id`, [event.id]);
    return NextResponse.json({ queued: result.rowCount ?? 0 });
  }
  const queued = await transaction(async (client) => {
    const result = await client.query(`INSERT INTO credential_email_deliveries (event_id, student_id, badge_id, recipient)
      SELECT es.event_id, s.id, b.id, LOWER(BTRIM(s.email))
      FROM event_students es JOIN students s ON s.id = es.student_id AND s.active
      JOIN badges b ON b.event_id = es.event_id AND b.student_id = s.id AND b.active
      WHERE es.event_id = $1 AND s.email IS NOT NULL AND BTRIM(s.email) <> '' AND b.token_ciphertext IS NOT NULL
      ON CONFLICT (badge_id, recipient) DO UPDATE SET
        status = CASE WHEN credential_email_deliveries.status = 'sent' THEN 'sent'::credential_email_status ELSE 'queued'::credential_email_status END,
        next_attempt_at = CASE WHEN credential_email_deliveries.status = 'sent' THEN credential_email_deliveries.next_attempt_at ELSE NOW() END,
        last_error = CASE WHEN credential_email_deliveries.status = 'sent' THEN credential_email_deliveries.last_error ELSE NULL END,
        updated_at = NOW()
      RETURNING status` , [event.id]);
    return result.rows.filter((row: { status: string }) => row.status === "queued").length;
  });
  return NextResponse.json({ queued });
}

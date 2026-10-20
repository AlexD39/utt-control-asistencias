import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { transaction } from "@/lib/db";

type Delivery = { id: string; status: "queued" | "sending" | "sent" | "failed"; sent_at: Date | null; recipient: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin"].includes(user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id: studentId } = await context.params;
  const body = await request.json().catch(() => ({})) as { resend?: boolean };

  try {
    const delivery = await transaction(async (client) => {
      const result = await client.query<{ event_id: string; badge_id: string; email: string | null }>(`SELECT e.id event_id, b.id badge_id, s.email
        FROM students s
        JOIN event_students es ON es.student_id = s.id
        JOIN events e ON e.id = es.event_id AND e.status = 'active'
        JOIN badges b ON b.event_id = e.id AND b.student_id = s.id AND b.active
        WHERE s.id = $1 AND s.active AND b.token_ciphertext IS NOT NULL
        AND ($2::boolean OR EXISTS (SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $3))
        ORDER BY e.starts_at DESC LIMIT 1 FOR UPDATE OF b`, [studentId, user.role === "super_admin", user.id]);
      const student = result.rows[0];
      if (!student) throw new Error("NO_CREDENTIAL");
      const recipient = student.email?.trim().toLowerCase();
      if (!recipient) throw new Error("NO_EMAIL");

      const queued = await client.query<Delivery>(`INSERT INTO credential_email_deliveries
        (event_id, student_id, badge_id, recipient)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (badge_id, recipient) DO UPDATE SET
          status = CASE WHEN credential_email_deliveries.status = 'sent' AND NOT $5::boolean
            THEN 'sent'::credential_email_status ELSE 'queued'::credential_email_status END,
          attempts = CASE WHEN credential_email_deliveries.status = 'sent' AND NOT $5::boolean
            THEN credential_email_deliveries.attempts ELSE 0 END,
          next_attempt_at = CASE WHEN credential_email_deliveries.status = 'sent' AND NOT $5::boolean
            THEN credential_email_deliveries.next_attempt_at ELSE NOW() END,
          last_error = CASE WHEN credential_email_deliveries.status = 'sent' AND NOT $5::boolean
            THEN credential_email_deliveries.last_error ELSE NULL END,
          updated_at = NOW()
        RETURNING id, status::text, sent_at, recipient`,
        [student.event_id, studentId, student.badge_id, recipient, Boolean(body.resend)]);
      return queued.rows[0];
    });

    return NextResponse.json({
      delivery: {
        id: delivery.id,
        status: delivery.status,
        sentAt: delivery.sent_at?.toISOString() ?? null,
        recipient: delivery.recipient,
      },
      process: delivery.status !== "sent",
    });
  } catch (error) {
    if ((error as Error).message === "NO_EMAIL") return NextResponse.json({ error: "El alumno no tiene correo registrado" }, { status: 409 });
    if ((error as Error).message === "NO_CREDENTIAL") return NextResponse.json({ error: "El alumno no tiene una credencial activa disponible" }, { status: 409 });
    return NextResponse.json({ error: "No se pudo preparar el correo" }, { status: 500 });
  }
}

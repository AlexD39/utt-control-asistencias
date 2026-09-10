import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { transaction } from "@/lib/db";

const schema = z.object({
  badgeCode: z.string().trim().min(4).max(300),
  sessionId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  source: z.enum(["qr", "nfc", "manual"]).default("manual"),
  deviceTime: z.iso.datetime().optional()
});

type BadgeRow = {
  badge_id: string;
  event_id: string;
  student_id: string;
  active: boolean;
  name: string;
  enrollment: string;
  program: string;
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos de lectura inválidos" }, { status: 400 });
  const normalizedCode = parsed.data.badgeCode.toUpperCase();

  const result = await transaction(async (client) => {
    const sessionResult = await client.query<{ id: string; event_id: string; name: string }>(
      "SELECT id, event_id, name FROM sessions WHERE id = $1 AND active = TRUE",
      [parsed.data.sessionId]
    );
    const session = sessionResult.rows[0];
    if (!session) return { status: 404, body: { result: "invalid_session", message: "La sesión no está disponible" } };

    const badgeResult = await client.query<BadgeRow>(`SELECT b.id badge_id, b.event_id, b.student_id, b.active,
      s.name, s.enrollment, s.program FROM badges b JOIN students s ON s.id = b.student_id
      WHERE b.token_hash = encode(digest($1, 'sha256'), 'hex')
         OR b.token_hash = encode(digest($2, 'sha256'), 'hex')
      LIMIT 1`, [parsed.data.badgeCode, normalizedCode]);
    const badge = badgeResult.rows[0];

    if (!badge) {
      await client.query(`INSERT INTO scan_attempts (event_id, session_id, scanned_by, result, source, device_time)
        VALUES ($1, $2, $3, 'invalid_badge', $4, $5)`, [session.event_id, session.id, user.id, parsed.data.source, parsed.data.deviceTime ?? null]);
      return { status: 404, body: { result: "invalid_badge", message: "Código no reconocido o credencial reemplazada" } };
    }

    const failure = !badge.active ? "inactive_badge" : badge.event_id !== session.event_id ? "wrong_event" : null;
    if (failure) {
      await client.query(`INSERT INTO scan_attempts (event_id, session_id, student_id, badge_id, scanned_by, result, source, device_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [session.event_id, session.id, badge.student_id, badge.badge_id, user.id, failure, parsed.data.source, parsed.data.deviceTime ?? null]);
      return { status: 409, body: { result: failure, message: failure === "inactive_badge" ? "El gafete está desactivado" : "El gafete pertenece a otro evento" } };
    }

    const attendance = await client.query<{ id: string }>(`INSERT INTO attendances
      (event_id, session_id, student_id, badge_id, scanned_by, device_time, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (session_id, student_id) DO NOTHING RETURNING id`,
      [session.event_id, session.id, badge.student_id, badge.badge_id, user.id, parsed.data.deviceTime ?? null, parsed.data.source]);
    const accepted = attendance.rowCount === 1;
    await client.query(`INSERT INTO scan_attempts
      (event_id, session_id, student_id, badge_id, scanned_by, result, source, device_time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [session.event_id, session.id, badge.student_id, badge.badge_id, user.id, accepted ? "accepted" : "duplicate", parsed.data.source, parsed.data.deviceTime ?? null]);
    return {
      status: accepted ? 201 : 200,
      body: {
        result: accepted ? "accepted" : "duplicate",
        message: accepted ? "Asistencia registrada" : "Este alumno ya tenía asistencia",
        student: { name: badge.name, enrollment: badge.enrollment, program: badge.program },
        session: session.name
      }
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}

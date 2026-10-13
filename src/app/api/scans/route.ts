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

type AccessRow = { credential_use_limit: number | null };

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos de lectura inválidos" }, { status: 400 });
  const normalizedCode = parsed.data.badgeCode.toUpperCase();

  const result = await transaction(async (client) => {
    const sessionResult = await client.query<{ id: string; event_id: string; name: string; requires_enrollment: boolean; consumes_credential_use: boolean }>(
      `SELECT s.id, s.event_id, s.name, s.requires_enrollment, s.consumes_credential_use FROM sessions s JOIN events e ON e.id = s.event_id
       WHERE s.id = $1 AND s.active = TRUE AND e.status = 'active' AND ($2::boolean OR EXISTS (
         SELECT 1 FROM event_staff ef WHERE ef.event_id = s.event_id AND ef.user_id = $3
       ))`,
      [parsed.data.sessionId, user.role === "super_admin", user.id]
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
      return { status: 409, body: { result: failure, message: failure === "inactive_badge" ? "El gafete está desactivado" : "El gafete pertenece a otro evento", student: { name: badge.name, enrollment: badge.enrollment, program: badge.program }, session: session.name } };
    }

    const accessResult = await client.query<AccessRow>(`SELECT credential_use_limit FROM event_students
      WHERE event_id = $1 AND student_id = $2 FOR UPDATE`, [session.event_id, badge.student_id]);
    const access = accessResult.rows[0];
    if (!access) {
      await client.query(`INSERT INTO scan_attempts (event_id, session_id, student_id, badge_id, scanned_by, result, source, device_time)
        VALUES ($1, $2, $3, $4, $5, 'wrong_event', $6, $7)`, [session.event_id, session.id, badge.student_id, badge.badge_id, user.id, parsed.data.source, parsed.data.deviceTime ?? null]);
      return { status: 409, body: { result: "wrong_event", message: "El alumno no pertenece a este congreso", student: { name: badge.name, enrollment: badge.enrollment, program: badge.program }, session: session.name } };
    }

    if (session.requires_enrollment) {
      const enrollment = await client.query("SELECT 1 FROM session_students WHERE session_id = $1 AND student_id = $2", [session.id, badge.student_id]);
      if (!enrollment.rows[0]) {
        await client.query(`INSERT INTO scan_attempts (event_id, session_id, student_id, badge_id, scanned_by, result, source, device_time)
          VALUES ($1, $2, $3, $4, $5, 'not_enrolled', $6, $7)`, [session.event_id, session.id, badge.student_id, badge.badge_id, user.id, parsed.data.source, parsed.data.deviceTime ?? null]);
        return { status: 409, body: { result: "not_enrolled", message: "El alumno no está inscrito en esta actividad", student: { name: badge.name, enrollment: badge.enrollment, program: badge.program }, session: session.name } };
      }
    }

    const usedResult = await client.query<{ total: number }>(`SELECT COUNT(*)::int total FROM attendances a
      JOIN sessions s ON s.id = a.session_id
      WHERE a.event_id = $1 AND a.student_id = $2 AND s.consumes_credential_use`, [session.event_id, badge.student_id]);
    const usesConsumed = usedResult.rows[0]?.total ?? 0;
    const remainingBefore = access.credential_use_limit === null ? null : Math.max(0, access.credential_use_limit - usesConsumed);
    const existingAttendance = await client.query("SELECT 1 FROM attendances WHERE session_id = $1 AND student_id = $2", [session.id, badge.student_id]);
    if (existingAttendance.rows[0]) {
      await client.query(`INSERT INTO scan_attempts
        (event_id, session_id, student_id, badge_id, scanned_by, result, source, device_time)
        VALUES ($1, $2, $3, $4, $5, 'duplicate', $6, $7)`,
        [session.event_id, session.id, badge.student_id, badge.badge_id, user.id, parsed.data.source, parsed.data.deviceTime ?? null]);
      return { status: 200, body: { result: "duplicate", message: "La asistencia ya estaba registrada; no se consumió otro uso", student: { name: badge.name, enrollment: badge.enrollment, program: badge.program }, session: session.name, credential: { reusable: access.credential_use_limit === null, maxUses: access.credential_use_limit, usesConsumed, remainingUses: remainingBefore } } };
    }

    if (session.consumes_credential_use && remainingBefore !== null && remainingBefore <= 0) {
      await client.query(`INSERT INTO scan_attempts (event_id, session_id, student_id, badge_id, scanned_by, result, source, device_time)
        VALUES ($1, $2, $3, $4, $5, 'usage_exhausted', $6, $7)`, [session.event_id, session.id, badge.student_id, badge.badge_id, user.id, parsed.data.source, parsed.data.deviceTime ?? null]);
      return { status: 409, body: { result: "usage_exhausted", message: "La credencial ya no tiene usos disponibles", student: { name: badge.name, enrollment: badge.enrollment, program: badge.program }, session: session.name, credential: { reusable: false, maxUses: access.credential_use_limit, usesConsumed, remainingUses: 0 } } };
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
        session: session.name,
        credential: {
          reusable: access.credential_use_limit === null,
          maxUses: access.credential_use_limit,
          usesConsumed: usesConsumed + (accepted && session.consumes_credential_use ? 1 : 0),
          remainingUses: access.credential_use_limit === null ? null : Math.max(0, access.credential_use_limit - usesConsumed - (accepted && session.consumes_credential_use ? 1 : 0))
        }
      }
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}

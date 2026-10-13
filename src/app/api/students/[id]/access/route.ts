import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-access";
import { query, transaction } from "@/lib/db";

const schema = z.object({
  credentialType: z.enum(["reusable", "limited"]),
  credentialUseLimit: z.number().int().positive().max(1_000).nullable(),
  workshopIds: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)).max(100)
}).superRefine((data, context) => {
  if (data.credentialType === "limited" && !data.credentialUseLimit) {
    context.addIssue({ code: "custom", path: ["credentialUseLimit"], message: "Indica el número de usos" });
  }
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin"].includes(user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id: studentId } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Revisa la configuración de acceso" }, { status: 400 });
  const eventResult = await query<{ id: string }>(`SELECT e.id FROM events e JOIN event_students es ON es.event_id = e.id
    WHERE e.status = 'active' AND es.student_id = $1 ORDER BY e.starts_at DESC LIMIT 1`, [studentId]);
  const event = eventResult.rows[0];
  if (!event) return NextResponse.json({ error: "El alumno no pertenece al congreso activo" }, { status: 404 });
  if (!(await canManageEvent(user, event.id))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  try {
    await transaction(async (client) => {
      await client.query("SELECT 1 FROM event_students WHERE event_id = $1 AND student_id = $2 FOR UPDATE", [event.id, studentId]);
      const useLimit = parsed.data.credentialType === "limited" ? parsed.data.credentialUseLimit : null;
      if (useLimit !== null) {
        const consumed = await client.query<{ total: number }>(`SELECT COUNT(*)::int total FROM attendances a
          JOIN sessions se ON se.id = a.session_id WHERE a.event_id = $1 AND a.student_id = $2
          AND se.consumes_credential_use`, [event.id, studentId]);
        if ((consumed.rows[0]?.total ?? 0) > useLimit) throw new Error("LIMIT_BELOW_USAGE");
      }
      const workshopIds = [...new Set(parsed.data.workshopIds)];
      if (workshopIds.length) {
        const workshops = await client.query<{ id: string; capacity: number | null; enrolled: number }>(`SELECT se.id, se.capacity,
          (SELECT COUNT(*)::int FROM session_students ss WHERE ss.session_id = se.id AND ss.student_id <> $3) enrolled
          FROM sessions se WHERE se.id = ANY($1::uuid[]) AND se.event_id = $2
          AND se.session_type = 'workshop' AND se.active ORDER BY se.id FOR UPDATE`, [workshopIds, event.id, studentId]);
        if (workshops.rowCount !== workshopIds.length) throw new Error("INVALID_WORKSHOP");
        if (workshops.rows.some((workshop) => workshop.capacity !== null && workshop.enrolled >= workshop.capacity)) throw new Error("WORKSHOP_FULL");
      }
      await client.query("UPDATE event_students SET credential_use_limit = $1 WHERE event_id = $2 AND student_id = $3", [useLimit, event.id, studentId]);
      await client.query(`DELETE FROM session_students ss USING sessions se
        WHERE ss.session_id = se.id AND se.event_id = $1 AND se.session_type = 'workshop'
        AND se.active AND ss.student_id = $2`, [event.id, studentId]);
      if (workshopIds.length) {
        await client.query("INSERT INTO session_students (session_id, student_id) SELECT UNNEST($1::uuid[]), $2", [workshopIds, studentId]);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "INVALID_WORKSHOP") return NextResponse.json({ error: "Uno de los talleres no está disponible" }, { status: 400 });
    if ((error as Error).message === "WORKSHOP_FULL") return NextResponse.json({ error: "Uno de los talleres ya no tiene cupo" }, { status: 409 });
    if ((error as Error).message === "LIMIT_BELOW_USAGE") return NextResponse.json({ error: "El límite no puede ser menor a los usos ya consumidos" }, { status: 409 });
    return NextResponse.json({ error: "No fue posible guardar la configuración" }, { status: 500 });
  }
}

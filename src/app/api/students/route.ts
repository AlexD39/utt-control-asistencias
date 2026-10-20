import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { generateBadgeCode } from "@/lib/badges";
import { sealCredential } from "@/lib/credential-crypto";
import { transaction } from "@/lib/db";

const schema = z.object({
  enrollment: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(150),
  email: z.union([z.email(), z.literal("")]).optional(),
  program: z.string().trim().min(2).max(150),
  credentialType: z.enum(["reusable", "limited"]).default("reusable"),
  credentialUseLimit: z.number().int().positive().max(1_000).nullable().optional(),
  workshopIds: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)).max(100).default([])
}).superRefine((data, context) => {
  if (data.credentialType === "limited" && !data.credentialUseLimit) {
    context.addIssue({ code: "custom", path: ["credentialUseLimit"], message: "Indica el número de usos" });
  }
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin"].includes(user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Revisa los datos del alumno" }, { status: 400 });

  try {
    const credential = generateBadgeCode();
    const sealed = sealCredential(credential);
    const result = await transaction(async (client) => {
      const event = await client.query<{ id: string }>(`SELECT e.id FROM events e WHERE e.status = 'active' AND ($1::boolean OR EXISTS (
        SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2
      )) ORDER BY e.starts_at DESC LIMIT 1`, [user.role === "super_admin", user.id]);
      if (!event.rows[0]) throw new Error("NO_ACTIVE_EVENT");
      const student = await client.query<{ id: string; name: string; enrollment: string; email: string | null; program: string }>(
        `INSERT INTO students (enrollment, name, email, program) VALUES ($1, $2, $3, $4)
         RETURNING id, name, enrollment, email, program`,
        [parsed.data.enrollment, parsed.data.name, parsed.data.email || null, parsed.data.program]
      );
      const created = student.rows[0];
      const useLimit = parsed.data.credentialType === "limited" ? parsed.data.credentialUseLimit : null;
      await client.query("INSERT INTO event_students (event_id, student_id, credential_use_limit) VALUES ($1, $2, $3)", [event.rows[0].id, created.id, useLimit]);
      const workshopIds = [...new Set(parsed.data.workshopIds)];
      if (workshopIds.length) {
        const workshops = await client.query<{ id: string; capacity: number | null; enrolled: number }>(`SELECT se.id, se.capacity,
          (SELECT COUNT(*)::int FROM session_students ss WHERE ss.session_id = se.id) enrolled
          FROM sessions se WHERE se.id = ANY($1::uuid[]) AND se.event_id = $2
          AND se.session_type = 'workshop' AND se.active ORDER BY se.id FOR UPDATE`, [workshopIds, event.rows[0].id]);
        if (workshops.rowCount !== workshopIds.length) throw new Error("INVALID_WORKSHOP");
        if (workshops.rows.some((workshop) => workshop.capacity !== null && workshop.enrolled >= workshop.capacity)) {
          throw new Error("WORKSHOP_FULL");
        }
        await client.query("INSERT INTO session_students (session_id, student_id) SELECT UNNEST($1::uuid[]), $2", [workshopIds, created.id]);
      }
      await client.query(`INSERT INTO badges (event_id, student_id, token_hash, token_ciphertext, token_iv, token_tag, label)
        VALUES ($1, $2, encode(digest($3, 'sha256'), 'hex'), $4, $5, $6, $7)`,
        [event.rows[0].id, created.id, credential, sealed.ciphertext, sealed.iv, sealed.tag, `Credencial ${created.enrollment}`]);
      return { ...created, credential, credentialUseLimit: useLimit, workshopCount: workshopIds.length };
    });
    return NextResponse.json({ student: result }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "La matrícula ya está registrada" }, { status: 409 });
    if ((error as Error).message === "NO_ACTIVE_EVENT") return NextResponse.json({ error: "No existe un evento activo" }, { status: 409 });
    if ((error as Error).message === "INVALID_WORKSHOP") return NextResponse.json({ error: "Uno de los talleres no está disponible en el congreso" }, { status: 400 });
    if ((error as Error).message === "WORKSHOP_FULL") return NextResponse.json({ error: "Uno de los talleres seleccionados ya no tiene cupo" }, { status: 409 });
    return NextResponse.json({ error: "No fue posible registrar al alumno" }, { status: 500 });
  }
}

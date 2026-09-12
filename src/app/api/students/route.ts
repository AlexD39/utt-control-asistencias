import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { generateBadgeCode } from "@/lib/badges";
import { transaction } from "@/lib/db";

const schema = z.object({
  enrollment: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(150),
  email: z.union([z.email(), z.literal("")]).optional(),
  program: z.string().trim().min(2).max(150)
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
    const result = await transaction(async (client) => {
      const event = await client.query<{ id: string }>(`SELECT e.id FROM events e WHERE e.status = 'active' AND ($1::boolean OR EXISTS (
        SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2
      )) ORDER BY e.starts_at DESC LIMIT 1`, [user.role === "super_admin", user.id]);
      if (!event.rows[0]) throw new Error("NO_ACTIVE_EVENT");
      const student = await client.query<{ id: string; name: string; enrollment: string; program: string }>(
        `INSERT INTO students (enrollment, name, email, program) VALUES ($1, $2, $3, $4)
         RETURNING id, name, enrollment, program`,
        [parsed.data.enrollment, parsed.data.name, parsed.data.email || null, parsed.data.program]
      );
      const created = student.rows[0];
      await client.query("INSERT INTO event_students (event_id, student_id) VALUES ($1, $2)", [event.rows[0].id, created.id]);
      await client.query(`INSERT INTO badges (event_id, student_id, token_hash, label)
        VALUES ($1, $2, encode(digest($3, 'sha256'), 'hex'), $4)`,
        [event.rows[0].id, created.id, credential, `Credencial ${created.enrollment}`]);
      return { ...created, credential };
    });
    return NextResponse.json({ student: result }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "La matrícula ya está registrada" }, { status: 409 });
    if ((error as Error).message === "NO_ACTIVE_EVENT") return NextResponse.json({ error: "No existe un evento activo" }, { status: 409 });
    return NextResponse.json({ error: "No fue posible registrar al alumno" }, { status: 500 });
  }
}

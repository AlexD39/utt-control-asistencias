import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { transaction } from "@/lib/db";

const schema = z.object({
  enrollment: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(150),
  email: z.union([z.email(), z.literal("")]).optional(),
  program: z.string().trim().min(2).max(150),
  active: z.boolean()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Revisa la información del alumno" }, { status: 400 });
  const { id } = await context.params;
  try {
    const updated = await transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        "UPDATE students SET enrollment = $1, name = $2, email = $3, program = $4, active = $5 WHERE id = $6 RETURNING id",
        [parsed.data.enrollment, parsed.data.name, parsed.data.email || null, parsed.data.program, parsed.data.active, id]
      );
      if (!result.rows[0]) return false;
      await client.query("UPDATE badges SET label = $1 WHERE student_id = $2", ["Credencial " + parsed.data.enrollment, id]);
      if (!parsed.data.active) {
        await client.query("UPDATE badges SET active = FALSE, revoked_at = NOW() WHERE student_id = $1 AND active = TRUE", [id]);
      }
      return true;
    });
    if (!updated) return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "La matrícula ya pertenece a otro alumno" }, { status: 409 });
    return NextResponse.json({ error: "No se pudo actualizar al alumno" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { normalizeCsvHeader, parseCsv } from "@/lib/csv";
import { transaction } from "@/lib/db";
import { canManageEvent } from "@/lib/event-access";

const eventIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const bodySchema = z.object({ content: z.string().min(1).max(2_000_000), eventId: eventIdSchema.optional() });
const rowSchema = z.object({
  enrollment: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(150),
  email: z.union([z.email(), z.literal("")]),
  program: z.string().trim().min(2).max(150)
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "El archivo está vacío o supera 2 MB" }, { status: 400 });
  if (body.data.eventId && !(await canManageEvent(user, body.data.eventId))) {
    return NextResponse.json({ error: "No tienes acceso a ese congreso" }, { status: 403 });
  }
  const rows = parseCsv(body.data.content);
  if (rows.length < 2) return NextResponse.json({ error: "El CSV no contiene alumnos" }, { status: 400 });
  if (rows.length > 5001) return NextResponse.json({ error: "El máximo por archivo es de 5,000 alumnos" }, { status: 400 });

  const headers = rows[0].map(normalizeCsvHeader);
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const enrollmentIndex = column("matricula", "enrollment");
  const nameIndex = column("nombre", "name", "nombrecompleto");
  const emailIndex = column("correo", "email", "correoinstitucional");
  const programIndex = column("programa", "carrera", "program");
  if (enrollmentIndex < 0 || nameIndex < 0 || programIndex < 0) {
    return NextResponse.json({ error: "Se requieren las columnas Matrícula, Nombre y Programa" }, { status: 400 });
  }

  const students: Array<z.infer<typeof rowSchema>> = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    const parsed = rowSchema.safeParse({
      enrollment: row[enrollmentIndex] ?? "",
      name: row[nameIndex] ?? "",
      email: emailIndex >= 0 ? row[emailIndex] ?? "" : "",
      program: row[programIndex] ?? ""
    });
    if (!parsed.success) {
      errors.push("Fila " + (index + 2) + ": datos incompletos o inválidos");
    } else if (seen.has(parsed.data.enrollment)) {
      errors.push("Fila " + (index + 2) + ": matrícula repetida en el archivo");
    } else {
      seen.add(parsed.data.enrollment);
      students.push(parsed.data);
    }
  });
  if (errors.length) return NextResponse.json({ error: "Corrige el archivo antes de importarlo", details: errors.slice(0, 20) }, { status: 400 });

  try {
    const result = await transaction(async (client) => {
      const event = body.data.eventId
        ? await client.query<{ id: string }>("SELECT id FROM events WHERE id = $1", [body.data.eventId])
        : await client.query<{ id: string }>(`SELECT e.id FROM events e WHERE e.status = 'active' AND ($1::boolean OR EXISTS (
            SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2
          )) ORDER BY e.starts_at DESC LIMIT 1`, [user.role === "super_admin", user.id]);
      if (!event.rows[0]) throw new Error("NO_ACTIVE_EVENT");
      const enrollments = students.map((student) => student.enrollment);
      const current = await client.query<{ enrollment: string }>("SELECT enrollment FROM students WHERE enrollment = ANY($1::text[])", [enrollments]);
      const existing = new Set(current.rows.map((row) => row.enrollment));
      for (const student of students) {
        const saved = await client.query<{ id: string }>(
          "INSERT INTO students (enrollment, name, email, program, active) VALUES ($1, $2, $3, $4, TRUE) " +
          "ON CONFLICT (enrollment) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, program = EXCLUDED.program, active = TRUE " +
          "RETURNING id",
          [student.enrollment, student.name, student.email || null, student.program]
        );
        await client.query("INSERT INTO event_students (event_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.rows[0].id, saved.rows[0].id]);
      }
      return {
        total: students.length,
        created: students.filter((student) => !existing.has(student.enrollment)).length,
        updated: students.filter((student) => existing.has(student.enrollment)).length
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    if ((error as Error).message === "NO_ACTIVE_EVENT") return NextResponse.json({ error: "No existe un congreso activo" }, { status: 409 });
    return NextResponse.json({ error: "No fue posible importar los alumnos" }, { status: 500 });
  }
}

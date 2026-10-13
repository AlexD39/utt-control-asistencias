import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { normalizeCsvHeader, parseCsv } from "@/lib/csv";
import { transaction } from "@/lib/db";
import { canManageEvent } from "@/lib/event-access";

const eventIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const bodySchema = z.object({ content: z.string().min(1).max(2_000_000), eventId: eventIdSchema.optional() });
const baseRowSchema = z.object({
  enrollment: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(150),
  email: z.union([z.email(), z.literal("")]),
  program: z.string().trim().min(2).max(150)
});

type ImportStudent = z.infer<typeof baseRowSchema> & {
  workshopCodes: string[];
  credentialUseLimit: number | null | undefined;
};

function normalizedValue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "El archivo está vacío o supera 2 MB" }, { status: 400 });
  if (body.data.eventId && !(await canManageEvent(user, body.data.eventId))) return NextResponse.json({ error: "No tienes acceso a ese congreso" }, { status: 403 });
  const rows = parseCsv(body.data.content);
  if (rows.length < 2) return NextResponse.json({ error: "El CSV no contiene alumnos" }, { status: 400 });
  if (rows.length > 5001) return NextResponse.json({ error: "El máximo por archivo es de 5,000 alumnos" }, { status: 400 });

  const headers = rows[0].map(normalizeCsvHeader);
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const enrollmentIndex = column("matricula", "enrollment");
  const nameIndex = column("nombre", "name", "nombrecompleto");
  const emailIndex = column("correo", "email", "correoinstitucional");
  const programIndex = column("programa", "carrera", "program");
  const workshopsIndex = column("talleres", "workshops", "workshopcodes", "taller");
  const credentialTypeIndex = column("tipocredencial", "credentialtype", "tipodecredencial");
  const usesIndex = column("usos", "uses", "limiteusos", "maxusos");
  if (enrollmentIndex < 0 || nameIndex < 0 || programIndex < 0) return NextResponse.json({ error: "Se requieren las columnas Matrícula, Nombre y Programa" }, { status: 400 });

  const students: ImportStudent[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    const parsed = baseRowSchema.safeParse({ enrollment: row[enrollmentIndex] ?? "", name: row[nameIndex] ?? "", email: emailIndex >= 0 ? row[emailIndex] ?? "" : "", program: row[programIndex] ?? "" });
    if (!parsed.success) return errors.push(`Fila ${index + 2}: datos incompletos o inválidos`);
    if (seen.has(parsed.data.enrollment)) return errors.push(`Fila ${index + 2}: matrícula repetida en el archivo`);
    seen.add(parsed.data.enrollment);
    const workshopCodes = workshopsIndex >= 0 ? [...new Set((row[workshopsIndex] ?? "").split("|").map((value) => value.trim().toUpperCase()).filter(Boolean))] : [];
    const typeValue = credentialTypeIndex >= 0 ? normalizedValue(row[credentialTypeIndex] ?? "") : "";
    const usesValue = usesIndex >= 0 ? (row[usesIndex] ?? "").trim() : "";
    let credentialUseLimit: number | null | undefined;
    if (!typeValue) credentialUseLimit = undefined;
    else if (["reutilizable", "reusable", "ilimitada", "unlimited"].includes(typeValue)) credentialUseLimit = null;
    else if (["limitada", "limited"].includes(typeValue)) {
      const uses = Number(usesValue);
      if (!Number.isInteger(uses) || uses <= 0 || uses > 1_000) return errors.push(`Fila ${index + 2}: indica entre 1 y 1,000 usos`);
      credentialUseLimit = uses;
    } else return errors.push(`Fila ${index + 2}: TipoCredencial debe ser reutilizable o limitada`);
    students.push({ ...parsed.data, workshopCodes, credentialUseLimit });
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
      const eventId = event.rows[0].id;
      const requestedCodes = [...new Set(students.flatMap((student) => student.workshopCodes))];
      const workshopResult = requestedCodes.length ? await client.query<{ id: string; code: string; capacity: number | null }>(`SELECT id, UPPER(code) code, capacity FROM sessions
        WHERE event_id = $1 AND session_type = 'workshop' AND active AND UPPER(code) = ANY($2::text[])
        ORDER BY id FOR UPDATE`, [eventId, requestedCodes]) : { rows: [], rowCount: 0 };
      const workshops = new Map(workshopResult.rows.map((workshop) => [workshop.code, workshop]));
      const missingCodes = requestedCodes.filter((code) => !workshops.has(code));
      if (missingCodes.length) throw new Error(`UNKNOWN_WORKSHOPS:${missingCodes.join(", ")}`);

      const enrollments = students.map((student) => student.enrollment);
      const current = await client.query<{ enrollment: string }>("SELECT enrollment FROM students WHERE enrollment = ANY($1::text[])", [enrollments]);
      const existing = new Set(current.rows.map((row) => row.enrollment));
      const studentIds = new Map<string, string>();
      for (const student of students) {
        const saved = await client.query<{ id: string }>(`INSERT INTO students (enrollment, name, email, program, active)
          VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (enrollment) DO UPDATE
          SET name = EXCLUDED.name, email = EXCLUDED.email, program = EXCLUDED.program, active = TRUE RETURNING id`,
          [student.enrollment, student.name, student.email || null, student.program]);
        const studentId = saved.rows[0].id;
        studentIds.set(student.enrollment, studentId);
        if (typeof student.credentialUseLimit === "number") {
          const consumed = await client.query<{ total: number }>(`SELECT COUNT(*)::int total FROM attendances a
            JOIN sessions se ON se.id = a.session_id WHERE a.event_id = $1 AND a.student_id = $2
            AND se.consumes_credential_use`, [eventId, studentId]);
          if ((consumed.rows[0]?.total ?? 0) > student.credentialUseLimit) throw new Error(`LIMIT_BELOW_USAGE:${student.enrollment}`);
        }
        if (student.credentialUseLimit === undefined) {
          await client.query("INSERT INTO event_students (event_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [eventId, studentId]);
        } else {
          await client.query(`INSERT INTO event_students (event_id, student_id, credential_use_limit) VALUES ($1, $2, $3)
            ON CONFLICT (event_id, student_id) DO UPDATE SET credential_use_limit = EXCLUDED.credential_use_limit`, [eventId, studentId, student.credentialUseLimit]);
        }
      }

      let workshopAssignments = 0;
      for (const [code, workshop] of workshops) {
        const ids = students.filter((student) => student.workshopCodes.includes(code)).map((student) => studentIds.get(student.enrollment) as string);
        const alreadyAssigned = await client.query<{ student_id: string }>("SELECT student_id FROM session_students WHERE session_id = $1 AND student_id = ANY($2::uuid[])", [workshop.id, ids]);
        const newCount = ids.length - (alreadyAssigned.rowCount ?? 0);
        if (workshop.capacity !== null) {
          const occupied = await client.query<{ total: number }>("SELECT COUNT(*)::int total FROM session_students WHERE session_id = $1", [workshop.id]);
          if ((occupied.rows[0]?.total ?? 0) + newCount > workshop.capacity) throw new Error(`WORKSHOP_FULL:${code}`);
        }
        const inserted = await client.query(`INSERT INTO session_students (session_id, student_id)
          SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING RETURNING student_id`, [workshop.id, ids]);
        workshopAssignments += inserted.rowCount ?? 0;
      }
      return { total: students.length, created: students.filter((student) => !existing.has(student.enrollment)).length, updated: students.filter((student) => existing.has(student.enrollment)).length, workshopAssignments };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "NO_ACTIVE_EVENT") return NextResponse.json({ error: "No existe un congreso activo" }, { status: 409 });
    if (message.startsWith("UNKNOWN_WORKSHOPS:")) return NextResponse.json({ error: `No existen estos talleres en el congreso: ${message.split(":")[1]}` }, { status: 400 });
    if (message.startsWith("WORKSHOP_FULL:")) return NextResponse.json({ error: `El taller ${message.split(":")[1]} no tiene cupo suficiente` }, { status: 409 });
    if (message.startsWith("LIMIT_BELOW_USAGE:")) return NextResponse.json({ error: `El límite indicado para ${message.split(":")[1]} es menor a sus usos consumidos` }, { status: 409 });
    return NextResponse.json({ error: "No fue posible importar los alumnos" }, { status: 500 });
  }
}

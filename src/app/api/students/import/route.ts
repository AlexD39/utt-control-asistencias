import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, isAdministrator } from "@/lib/auth";
import { normalizeCsvHeader, parseCsv } from "@/lib/csv";
import { transaction } from "@/lib/db";
import { canManageEvent } from "@/lib/event-access";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_STUDENTS, parseStudentImportFile } from "@/lib/student-import-file";
import { generateBadgeCode } from "@/lib/badges";
import { sealCredential } from "@/lib/credential-crypto";

const eventIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const importOptionsSchema = z.object({ sharedWorkshopIds: z.array(eventIdSchema).max(100).default([]), queueEmails: z.boolean().default(false) });
const legacyBodySchema = z.object({ content: z.string().min(1).max(MAX_IMPORT_FILE_BYTES), eventId: eventIdSchema.optional(), sharedWorkshopIds: z.array(eventIdSchema).max(100).default([]), queueEmails: z.boolean().default(false) });
const baseRowSchema = z.object({
  enrollment: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(150),
  email: z.union([z.email(), z.literal("")]),
  program: z.string().trim().min(2).max(150)
});

type ImportStudent = z.infer<typeof baseRowSchema> & {
  workshopRefs: string[];
  credentialUseLimit: number | null | undefined;
};

function normalizedValue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

async function readImportRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const eventIdValue = form.get("eventId");
    const eventId = typeof eventIdValue === "string" && eventIdValue ? eventIdValue : undefined;
    if (eventId && !eventIdSchema.safeParse(eventId).success) throw new Error("INVALID_EVENT");
    const options = importOptionsSchema.safeParse({
      sharedWorkshopIds: form.getAll("sharedWorkshopIds").filter((value): value is string => typeof value === "string"),
      queueEmails: form.get("queueEmails") === "true"
    });
    if (!options.success) throw new Error("INVALID_OPTIONS");
    if (!(file instanceof File) || file.size === 0) throw new Error("EMPTY_FILE");
    if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
    const content = Buffer.from(await file.arrayBuffer());
    const rows = file.name.trim().toLowerCase().endsWith(".csv")
      ? parseCsv(content.toString("utf8"))
      : await parseStudentImportFile(file.name, content);
    return { rows, eventId, ...options.data };
  }

  const body = legacyBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) throw new Error("EMPTY_FILE");
  return { rows: parseCsv(body.data.content), eventId: body.data.eventId, sharedWorkshopIds: body.data.sharedWorkshopIds, queueEmails: body.data.queueEmails };
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "event_admin")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  let imported: Awaited<ReturnType<typeof readImportRequest>>;
  try {
    imported = await readImportRequest(request);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNSUPPORTED_FILE") return NextResponse.json({ error: "Formato no compatible. Usa un archivo .xlsx o .csv" }, { status: 400 });
    if (message === "FILE_TOO_LARGE") return NextResponse.json({ error: "El archivo supera el límite de 5 MB" }, { status: 400 });
    if (message === "INVALID_EVENT") return NextResponse.json({ error: "El congreso seleccionado no es válido" }, { status: 400 });
    if (message === "INVALID_OPTIONS") return NextResponse.json({ error: "La selección de talleres no es válida" }, { status: 400 });
    return NextResponse.json({ error: "No fue posible leer el archivo. Verifica que no esté dañado o protegido con contraseña" }, { status: 400 });
  }
  if (imported.eventId && !(await canManageEvent(user, imported.eventId))) return NextResponse.json({ error: "No tienes acceso a ese congreso" }, { status: 403 });
  const rows = imported.rows;
  if (rows.length < 2) return NextResponse.json({ error: "El archivo no contiene alumnos" }, { status: 400 });
  if (rows.length > MAX_IMPORT_STUDENTS + 1) return NextResponse.json({ error: `El máximo por archivo es de ${MAX_IMPORT_STUDENTS.toLocaleString("es-MX")} alumnos` }, { status: 400 });

  const headers = rows[0].map(normalizeCsvHeader);
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const enrollmentIndex = column("matricula", "enrollment");
  const nameIndex = column("nombre", "name", "nombrecompleto");
  const emailIndex = column("correo", "email", "correoinstitucional");
  const programIndex = column("programa", "carrera", "program");
  const workshopsIndex = column("talleres", "workshops", "workshopcodes", "taller", "actividades", "activities", "actividad");
  const credentialTypeIndex = column("tipocredencial", "credentialtype", "tipodecredencial");
  const usesIndex = column("usos", "uses", "limiteusos", "maxusos");
  if (enrollmentIndex < 0 || nameIndex < 0 || programIndex < 0) return NextResponse.json({ error: "Se requieren las columnas Matrícula, Nombre y Programa" }, { status: 400 });

  const students: ImportStudent[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    const email = emailIndex >= 0 ? row[emailIndex] ?? "" : "";
    if (email && !z.email().safeParse(email).success) return errors.push(`Fila ${index + 2}: el correo no tiene un formato válido`);
    const parsed = baseRowSchema.safeParse({ enrollment: row[enrollmentIndex] ?? "", name: row[nameIndex] ?? "", email, program: row[programIndex] ?? "" });
    if (!parsed.success) return errors.push(`Fila ${index + 2}: datos incompletos o inválidos`);
    if (seen.has(parsed.data.enrollment)) return errors.push(`Fila ${index + 2}: matrícula repetida en el archivo`);
    seen.add(parsed.data.enrollment);
    const workshopRefs = workshopsIndex >= 0 ? [...new Map((row[workshopsIndex] ?? "").split("|").map((value) => value.trim()).filter(Boolean).map((value) => [normalizedValue(value), value])).values()] : [];
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
    students.push({ ...parsed.data, workshopRefs, credentialUseLimit });
  });
  if (errors.length) return NextResponse.json({ error: "Corrige el archivo antes de importarlo", details: errors.slice(0, 20) }, { status: 400 });

  try {
    const result = await transaction(async (client) => {
      const event = imported.eventId
        ? await client.query<{ id: string }>("SELECT id FROM events WHERE id = $1", [imported.eventId])
        : await client.query<{ id: string }>(`SELECT e.id FROM events e WHERE e.status = 'active' AND ($1::boolean OR EXISTS (
            SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2
          )) ORDER BY e.starts_at DESC LIMIT 1`, [isAdministrator(user), user.id]);
      if (!event.rows[0]) throw new Error("NO_ACTIVE_EVENT");
      const eventId = event.rows[0].id;
      type WorkshopRow = { id: string; code: string; name: string; capacity: number | null };
      const requestedRefs = [...new Set(students.flatMap((student) => student.workshopRefs))];
      const needsWorkshops = requestedRefs.length > 0 || imported.sharedWorkshopIds.length > 0;
      const workshopResult = needsWorkshops ? await client.query<WorkshopRow>(`SELECT id, code, name, capacity FROM sessions
        WHERE event_id = $1 AND active
          AND (session_type = 'workshop' OR (session_type = 'general' AND requires_enrollment))
        ORDER BY id FOR UPDATE`, [eventId]) : { rows: [] as WorkshopRow[] };
      const workshops = new Map(workshopResult.rows.map((workshop) => [workshop.id, workshop]));
      const byCode = new Map(workshopResult.rows.map((workshop) => [normalizedValue(workshop.code), workshop]));
      const byName = new Map<string, WorkshopRow | null>();
      for (const workshop of workshopResult.rows) {
        const key = normalizedValue(workshop.name);
        byName.set(key, byName.has(key) ? null : workshop);
      }
      const invalidSharedIds = imported.sharedWorkshopIds.filter((id) => !workshops.has(id));
      if (invalidSharedIds.length) throw new Error("INVALID_WORKSHOP_SELECTION");
      const unknownRefs = new Set<string>();
      const ambiguousRefs = new Set<string>();
      const studentWorkshops = new Map<string, Set<string>>();
      for (const student of students) {
        const assigned = new Set(imported.sharedWorkshopIds);
        for (const reference of student.workshopRefs) {
          const key = normalizedValue(reference);
          const workshop = byCode.get(key) ?? byName.get(key);
          if (workshop === null) ambiguousRefs.add(reference);
          else if (!workshop) unknownRefs.add(reference);
          else assigned.add(workshop.id);
        }
        studentWorkshops.set(student.enrollment, assigned);
      }
      if (ambiguousRefs.size) throw new Error(`AMBIGUOUS_WORKSHOPS:${[...ambiguousRefs].join(", ")}`);
      if (unknownRefs.size) throw new Error(`UNKNOWN_WORKSHOPS:${[...unknownRefs].join(", ")}`);

      const enrollments = students.map((student) => student.enrollment);
      const current = await client.query<{ enrollment: string }>("SELECT enrollment FROM students WHERE enrollment = ANY($1::text[])", [enrollments]);
      const existing = new Set(current.rows.map((row) => row.enrollment));
      const studentIds = new Map<string, string>();
      let credentialsCreated = 0;
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
        const badge = await client.query<{ id: string; token_ciphertext: string | null }>("SELECT id, token_ciphertext FROM badges WHERE event_id = $1 AND student_id = $2 FOR UPDATE", [eventId, studentId]);
        if (!badge.rows[0] || !badge.rows[0].token_ciphertext) {
          const credential = generateBadgeCode();
          const sealed = sealCredential(credential);
          if (badge.rows[0]) {
            await client.query(`UPDATE badges SET token_hash = encode(digest($1, 'sha256'), 'hex'), token_ciphertext = $2,
              token_iv = $3, token_tag = $4, label = $5, active = TRUE, issued_at = NOW(), revoked_at = NULL WHERE id = $6`,
            [credential, sealed.ciphertext, sealed.iv, sealed.tag, `Credencial ${student.enrollment}`, badge.rows[0].id]);
          } else {
            await client.query(`INSERT INTO badges (event_id, student_id, token_hash, token_ciphertext, token_iv, token_tag, label)
              VALUES ($1, $2, encode(digest($3, 'sha256'), 'hex'), $4, $5, $6, $7)`,
            [eventId, studentId, credential, sealed.ciphertext, sealed.iv, sealed.tag, `Credencial ${student.enrollment}`]);
          }
          credentialsCreated += 1;
        }
      }

      let workshopAssignments = 0;
      for (const workshop of workshops.values()) {
        const ids = students.filter((student) => studentWorkshops.get(student.enrollment)?.has(workshop.id)).map((student) => studentIds.get(student.enrollment) as string);
        if (!ids.length) continue;
        const alreadyAssigned = await client.query<{ student_id: string }>("SELECT student_id FROM session_students WHERE session_id = $1 AND student_id = ANY($2::uuid[])", [workshop.id, ids]);
        const newCount = ids.length - (alreadyAssigned.rowCount ?? 0);
        if (workshop.capacity !== null) {
          const occupied = await client.query<{ total: number }>("SELECT COUNT(*)::int total FROM session_students WHERE session_id = $1", [workshop.id]);
          if ((occupied.rows[0]?.total ?? 0) + newCount > workshop.capacity) throw new Error(`WORKSHOP_FULL:${workshop.code}`);
        }
        const inserted = await client.query(`INSERT INTO session_students (session_id, student_id)
          SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING RETURNING student_id`, [workshop.id, ids]);
        workshopAssignments += inserted.rowCount ?? 0;
      }
      let queuedEmails = 0;
      if (imported.queueEmails) {
        const queued = await client.query<{ status: string }>(`INSERT INTO credential_email_deliveries (event_id, student_id, badge_id, recipient)
          SELECT $1, s.id, b.id, LOWER(BTRIM(s.email)) FROM students s
          JOIN badges b ON b.event_id = $1 AND b.student_id = s.id AND b.active
          WHERE s.id = ANY($2::uuid[]) AND s.email IS NOT NULL AND BTRIM(s.email) <> '' AND b.token_ciphertext IS NOT NULL
          ON CONFLICT (badge_id, recipient) DO UPDATE SET
            status = CASE WHEN credential_email_deliveries.status = 'sent' THEN 'sent'::credential_email_status ELSE 'queued'::credential_email_status END,
            next_attempt_at = CASE WHEN credential_email_deliveries.status = 'sent' THEN credential_email_deliveries.next_attempt_at ELSE NOW() END,
            last_error = CASE WHEN credential_email_deliveries.status = 'sent' THEN credential_email_deliveries.last_error ELSE NULL END,
            updated_at = NOW() RETURNING status`, [eventId, [...studentIds.values()]]);
        queuedEmails = queued.rows.filter((delivery) => delivery.status === "queued").length;
      }
      return { total: students.length, created: students.filter((student) => !existing.has(student.enrollment)).length, updated: students.filter((student) => existing.has(student.enrollment)).length, workshopAssignments, credentialsCreated, queuedEmails };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "NO_ACTIVE_EVENT") return NextResponse.json({ error: "No existe un congreso activo" }, { status: 409 });
    if (message.startsWith("UNKNOWN_WORKSHOPS:")) return NextResponse.json({ error: `No existen estos talleres en el congreso: ${message.split(":")[1]}` }, { status: 400 });
    if (message.startsWith("AMBIGUOUS_WORKSHOPS:")) return NextResponse.json({ error: `Estos nombres corresponden a más de un taller; usa su clave: ${message.split(":")[1]}` }, { status: 400 });
    if (message === "INVALID_WORKSHOP_SELECTION") return NextResponse.json({ error: "Uno de los talleres seleccionados ya no está disponible" }, { status: 400 });
    if (message.startsWith("WORKSHOP_FULL:")) return NextResponse.json({ error: `El taller ${message.split(":")[1]} no tiene cupo suficiente` }, { status: 409 });
    if (message.startsWith("LIMIT_BELOW_USAGE:")) return NextResponse.json({ error: `El límite indicado para ${message.split(":")[1]} es menor a sus usos consumidos` }, { status: 409 });
    return NextResponse.json({ error: "No fue posible importar los alumnos" }, { status: 500 });
  }
}

import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { buildStudentWhere, normalizeStudentFilters } from "@/lib/student-query";

type ExportRow = {
  enrollment: string;
  name: string;
  email: string | null;
  program: string;
  student_status: string;
  badge_status: string;
  attendances: string;
};

function csvCell(value: string | null) {
  const text = value ?? "";
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin", "viewer"].includes(user.role)) {
    return new Response("No autorizado", { status: 403 });
  }
  const url = new URL(request.url);
  const filters = normalizeStudentFilters({
    q: url.searchParams.get("q"),
    program: url.searchParams.get("program"),
    status: url.searchParams.get("status"),
    credential: url.searchParams.get("credential")
  });
  const where = buildStudentWhere(filters);
  const sql =
    "SELECT s.enrollment, s.name, s.email, s.program, " +
    "CASE WHEN s.active THEN 'Activo' ELSE 'Inactivo' END student_status, " +
    "CASE WHEN b.active THEN 'Activa' ELSE 'Sin credencial activa' END badge_status, " +
    "COUNT(a.id)::text attendances FROM students s " +
    "LEFT JOIN LATERAL (SELECT id, active FROM badges WHERE student_id = s.id ORDER BY issued_at DESC LIMIT 1) b ON TRUE " +
    "LEFT JOIN attendances a ON a.student_id = s.id " +
    where.sql +
    " GROUP BY s.id, b.active ORDER BY s.name";
  const { rows } = await query<ExportRow>(sql, where.values);
  const header = ["Matrícula", "Nombre", "Correo", "Programa", "Estado", "Credencial", "Asistencias"];
  const lines = rows.map((row) => [
    row.enrollment,
    row.name,
    row.email,
    row.program,
    row.student_status,
    row.badge_status,
    row.attendances
  ].map(csvCell).join(","));
  const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="alumnos-' + new Date().toISOString().slice(0, 10) + '.csv"'
    }
  });
}

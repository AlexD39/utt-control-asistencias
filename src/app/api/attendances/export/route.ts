import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { buildAttendanceWhere, normalizeAttendanceFilters } from "@/lib/attendance-query";
import { createXlsx } from "@/lib/xlsx";

type ExportRow = {
  enrollment: string; name: string; email: string | null; program: string; event_name: string;
  session_code: string; session_name: string; room: string; scanned_at: Date; source: string;
  scanner_name: string; occurrence: number;
};

const mexicoDate = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });
const mexicoTime = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin", "viewer"].includes(user.role)) return new Response("No autorizado", { status: 403 });
  const url = new URL(request.url);
  const filters = normalizeAttendanceFilters(Object.fromEntries(url.searchParams));
  const where = buildAttendanceWhere(filters);
  const { rows } = await query<ExportRow>(`WITH ranked AS (
    SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.session_id, a.student_id ORDER BY a.scanned_at, a.id)::int occurrence
    FROM attendances a
  )
  SELECT st.enrollment, st.name, st.email, st.program, e.name event_name, se.code session_code,
    se.name session_name, se.room, a.scanned_at, a.source, COALESCE(u.name, 'Usuario eliminado') scanner_name, a.occurrence
  FROM ranked a
  JOIN students st ON st.id = a.student_id
  JOIN sessions se ON se.id = a.session_id
  JOIN events e ON e.id = a.event_id
  LEFT JOIN users u ON u.id = a.scanned_by
  ${where.sql}
  ORDER BY a.scanned_at DESC, st.name`, where.values);

  const workbook = createXlsx([
    "Matrícula", "Alumno", "Correo", "Programa", "Congreso", "Clave actividad", "Actividad", "Sala o acceso",
    "Tipo de registro", "Fecha", "Hora", "Origen", "Registró"
  ], rows.map((row) => [
    row.enrollment, row.name, row.email, row.program, row.event_name, row.session_code, row.session_name, row.room,
    row.occurrence === 1 ? "Asistencia inicial" : `Confirmación ${row.occurrence - 1}`,
    mexicoDate.format(row.scanned_at), mexicoTime.format(row.scanned_at), row.source.toUpperCase(), row.scanner_name
  ]), "Asistencias");
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Response(Buffer.from(workbook), { headers: {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="asistencias-${stamp}.xlsx"`, "cache-control": "no-store"
  } });
}

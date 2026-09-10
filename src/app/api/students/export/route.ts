import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

type ExportRow = { enrollment: string; name: string; email: string | null; program: string; badge_status: string; attendances: string };

function csvCell(value: string | null) {
  const text = value ?? "";
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || !["super_admin", "event_admin", "viewer"].includes(user.role)) {
    return new Response("No autorizado", { status: 403 });
  }
  const { rows } = await query<ExportRow>(`SELECT s.enrollment, s.name, s.email, s.program,
    CASE WHEN b.active THEN 'Activo' ELSE 'Sin credencial activa' END badge_status,
    COUNT(a.id)::text attendances FROM students s
    LEFT JOIN badges b ON b.student_id = s.id LEFT JOIN attendances a ON a.student_id = s.id
    GROUP BY s.id, b.active ORDER BY s.name`);
  const header = ["Matrícula", "Nombre", "Correo", "Programa", "Credencial", "Asistencias"];
  const lines = rows.map((row) => [row.enrollment, row.name, row.email, row.program, row.badge_status, row.attendances].map(csvCell).join(","));
  const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="alumnos-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}

import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";

type Attendance = { id: string; name: string; enrollment: string; program: string; session_name: string; room: string; scanned_at: Date; source: string; scanner_name: string; occurrence: number };

export default async function AttendancesPage() {
  await requireUser(["super_admin", "event_admin", "viewer"]);
  const { rows } = await query<Attendance>(`SELECT a.id, st.name, st.enrollment, st.program, se.name session_name,
    se.room, a.scanned_at, a.source, u.name scanner_name,
    ROW_NUMBER() OVER (PARTITION BY a.session_id, a.student_id ORDER BY a.scanned_at, a.id)::int occurrence
    FROM attendances a
    JOIN students st ON st.id = a.student_id JOIN sessions se ON se.id = a.session_id
    JOIN users u ON u.id = a.scanned_by ORDER BY a.scanned_at DESC`);
  return <><div className="page-heading"><div><p className="eyebrow">AUDITORÍA</p><h1>Asistencias</h1><p>{rows.length} registros conservados entre asistencias iniciales y confirmaciones.</p></div><button className="button button-secondary" disabled>Exportar a Sheets · Próximamente</button></div>
    <section className="card table-card"><div className="table-toolbar"><strong>Últimos registros</strong><span className="pill">ACTUALIZADO</span></div><div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Sesión</th><th>Tipo</th><th>Registro</th><th>Origen</th><th>Registró</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={6} className="empty-cell">Todavía no hay asistencias. Realiza una lectura de prueba.</td></tr> : rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.enrollment} · {row.program}</small></td><td>{row.session_name}<small>{row.room}</small></td><td><span className={row.occurrence === 1 ? "source-tag" : "source-tag attendance-confirmation"}>{row.occurrence === 1 ? "ASISTENCIA INICIAL" : `CONFIRMACIÓN ${row.occurrence - 1}`}</span></td><td>{formatDate(row.scanned_at)}</td><td><span className="source-tag">{row.source.toUpperCase()}</span></td><td>{row.scanner_name}</td></tr>)}</tbody></table></div></section></>;
}

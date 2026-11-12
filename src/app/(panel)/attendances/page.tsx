import Link from "next/link";
import { Download, FilterX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { attendanceFilterParams, buildAttendanceWhere, normalizeAttendanceFilters } from "@/lib/attendance-query";

type Attendance = {
  id: string; name: string; enrollment: string; program: string; event_name: string; session_name: string;
  room: string; scanned_at: Date; source: string; scanner_name: string; occurrence: number;
};

type SearchParams = Partial<Record<"q" | "event" | "session" | "from" | "to" | "kind" | "source", string>>;

export default async function AttendancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser(["super_admin", "event_admin", "viewer"]);
  const filters = normalizeAttendanceFilters(await searchParams);
  const where = buildAttendanceWhere(filters);
  const sessionsWhere = filters.event ? "WHERE s.event_id = $1" : "";
  const [attendanceResult, eventsResult, sessionsResult] = await Promise.all([
    query<Attendance>(`WITH ranked AS (
      SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.session_id, a.student_id ORDER BY a.scanned_at, a.id)::int occurrence
      FROM attendances a
    )
    SELECT a.id, st.name, st.enrollment, st.program, e.name event_name, se.name session_name,
      se.room, a.scanned_at, a.source, COALESCE(u.name, 'Usuario eliminado') scanner_name, a.occurrence
    FROM ranked a
    JOIN students st ON st.id = a.student_id
    JOIN sessions se ON se.id = a.session_id
    JOIN events e ON e.id = a.event_id
    LEFT JOIN users u ON u.id = a.scanned_by
    ${where.sql}
    ORDER BY a.scanned_at DESC, a.id DESC`, where.values),
    query<{ id: string; name: string }>("SELECT id, name FROM events ORDER BY starts_at DESC, name"),
    query<{ id: string; name: string; code: string; event_name: string }>(`SELECT s.id, s.name, s.code, e.name event_name
      FROM sessions s JOIN events e ON e.id = s.event_id ${sessionsWhere}
      ORDER BY e.starts_at DESC, s.starts_at, s.name`, filters.event ? [filters.event] : [])
  ]);
  const rows = attendanceResult.rows;
  const exportParams = attendanceFilterParams(filters);
  const exportUrl = "/api/attendances/export" + (exportParams.size ? "?" + exportParams.toString() : "");
  const initialCount = rows.filter((row) => row.occurrence === 1).length;
  const confirmationCount = rows.length - initialCount;

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">AUDITORÍA</p><h1>Asistencias</h1><p>{rows.length} registros coinciden con los filtros seleccionados.</p></div>
      <div className="heading-actions"><a className="button button-primary" href={exportUrl}><Download aria-hidden />Exportar Excel</a></div>
    </div>

    <form className="attendance-filters card" method="get">
      <label className="attendance-filter-search">Buscar alumno<input name="q" defaultValue={filters.q} placeholder="Nombre, matrícula o programa" /></label>
      <label>Congreso<select name="event" defaultValue={filters.event}><option value="">Todos los congresos</option>{eventsResult.rows.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
      <label>Actividad<select name="session" defaultValue={filters.session}><option value="">Todas las actividades</option>{sessionsResult.rows.map((session) => <option key={session.id} value={session.id}>{session.code} · {session.name}{filters.event ? "" : ` · ${session.event_name}`}</option>)}</select></label>
      <label>Desde<input name="from" type="date" defaultValue={filters.from} /></label>
      <label>Hasta<input name="to" type="date" defaultValue={filters.to} /></label>
      <label>Tipo de registro<select name="kind" defaultValue={filters.kind}><option value="">Todos</option><option value="initial">Asistencia inicial</option><option value="confirmation">Confirmaciones</option></select></label>
      <label>Origen<select name="source" defaultValue={filters.source}><option value="">Todos</option><option value="qr">Código QR</option><option value="nfc">NFC</option><option value="manual">Captura manual</option></select></label>
      <div className="attendance-filter-actions"><button className="button button-primary" type="submit">Aplicar filtros</button><Link href="/attendances" className="button button-secondary"><FilterX aria-hidden />Limpiar</Link></div>
    </form>

    <section className="attendance-summary" aria-label="Resumen filtrado">
      <article className="card"><span>Total</span><strong>{rows.length}</strong><small>registros</small></article>
      <article className="card"><span>Iniciales</span><strong>{initialCount}</strong><small>primer ingreso</small></article>
      <article className="card"><span>Confirmaciones</span><strong>{confirmationCount}</strong><small>ingresos posteriores</small></article>
    </section>

    <section className="card table-card">
      <div className="table-toolbar"><strong>Registros de asistencia</strong><span className="pill">FILTROS APLICADOS AL EXCEL</span></div>
      <div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Congreso / actividad</th><th>Tipo</th><th>Registro</th><th>Origen</th><th>Registró</th></tr></thead><tbody>
        {rows.length === 0 ? <tr><td colSpan={6} className="empty-cell">No hay asistencias que coincidan con estos filtros.</td></tr> : rows.map((row) => <tr key={row.id}>
          <td><strong>{row.name}</strong><small>{row.enrollment} · {row.program}</small></td>
          <td><strong>{row.session_name}</strong><small>{row.event_name} · {row.room}</small></td>
          <td><span className={row.occurrence === 1 ? "source-tag" : "source-tag attendance-confirmation"}>{row.occurrence === 1 ? "ASISTENCIA INICIAL" : `CONFIRMACIÓN ${row.occurrence - 1}`}</span></td>
          <td>{formatDate(row.scanned_at)}</td><td><span className="source-tag">{row.source.toUpperCase()}</span></td><td>{row.scanner_name}</td>
        </tr>)}
      </tbody></table></div>
    </section>
  </>;
}

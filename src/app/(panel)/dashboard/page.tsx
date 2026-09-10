import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";

type Metrics = { students: string; attendances: string; sessions: string; scanners: string };
type EventRow = { id: string; name: string; venue: string; starts_at: Date; ends_at: Date; status: string };
type Recent = { name: string; enrollment: string; session_name: string; scanned_at: Date; source: string };

export default async function DashboardPage() {
  const user = await requireUser();
  const [metricsResult, eventResult, recentResult] = await Promise.all([
    query<Metrics>(`WITH current_event AS (SELECT id FROM events WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1)
      SELECT
      (SELECT COUNT(*) FROM event_students WHERE event_id = (SELECT id FROM current_event))::text students,
      (SELECT COUNT(*) FROM attendances WHERE event_id = (SELECT id FROM current_event))::text attendances,
      (SELECT COUNT(*) FROM sessions WHERE active AND event_id = (SELECT id FROM current_event))::text sessions,
      (SELECT COUNT(*) FROM users WHERE active AND role = 'scanner')::text scanners`),
    query<EventRow>("SELECT * FROM events ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, starts_at DESC LIMIT 1"),
    query<Recent>(`SELECT st.name, st.enrollment, se.name session_name, a.scanned_at, a.source
      FROM attendances a JOIN students st ON st.id = a.student_id JOIN sessions se ON se.id = a.session_id
      JOIN events e ON e.id = a.event_id WHERE e.status = 'active' ORDER BY a.scanned_at DESC LIMIT 6`)
  ]);
  const metrics = metricsResult.rows[0];
  const event = eventResult.rows[0];
  const canScan = user.role !== "viewer";

  return <>
    <div className="page-heading"><div><p className="eyebrow">PANORAMA GENERAL</p><h1>Buenos días, {user.name.split(" ")[0]}</h1><p>Esto es lo que está pasando en el congreso.</p></div>{canScan && <Link href="/scanner" className="button button-primary">⌗ Registrar asistencia</Link>}</div>
    {event && <section className="event-banner"><div><span className={event.status === "active" ? "pill pill-live" : "pill"}>{event.status === "active" ? "● EN CURSO" : event.status === "draft" ? "BORRADOR" : "CERRADO"}</span><h2>{event.name}</h2><p>{event.venue} · {formatDate(event.starts_at, false)} – {formatDate(event.ends_at, false)}</p></div><div className="event-number"><strong>{metrics.attendances}</strong><span>registros del congreso activo</span></div></section>}
    <section className="metric-grid">
      <article className="metric-card"><span className="metric-icon mint">◎</span><p>Alumnos inscritos</p><strong>{metrics.students}</strong><small>Padrón del evento</small></article>
      <article className="metric-card"><span className="metric-icon coral">✓</span><p>Asistencias</p><strong>{metrics.attendances}</strong><small>Registros confirmados</small></article>
      <article className="metric-card"><span className="metric-icon blue">▦</span><p>Sesiones activas</p><strong>{metrics.sessions}</strong><small>Disponibles para registro</small></article>
      <article className="metric-card"><span className="metric-icon gold">◇</span><p>Registradores</p><strong>{metrics.scanners}</strong><small>Usuarios habilitados</small></article>
    </section>
    <section className="card table-card"><div className="card-head"><div><h2>Actividad reciente</h2><p>Últimas asistencias registradas</p></div><Link href="/attendances">Ver todas →</Link></div>
      {recentResult.rows.length ? <div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Sesión</th><th>Método</th><th>Hora</th></tr></thead><tbody>{recentResult.rows.map((row, i) => <tr key={`${row.enrollment}-${i}`}><td><strong>{row.name}</strong><small>{row.enrollment}</small></td><td>{row.session_name}</td><td><span className="pill">{row.source.toUpperCase()}</span></td><td>{formatDate(row.scanned_at)}</td></tr>)}</tbody></table></div> : <div className="empty"><span>⌗</span><strong>Aún no hay asistencias</strong><p>Usa los códigos de demostración desde el módulo Escanear.</p></div>}
    </section>
  </>;
}

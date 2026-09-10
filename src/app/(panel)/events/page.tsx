import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { EventForm } from "@/components/event-form";

type EventRow = {
  id: string; name: string; venue: string; starts_at: Date; ends_at: Date;
  status: "draft" | "active" | "closed"; sessions: string; students: string; attendances: string;
};

const statusLabel = { draft: "BORRADOR", active: "ACTIVO", closed: "CERRADO" };

export default async function EventsPage() {
  const user = await requireUser(["super_admin", "event_admin", "viewer"]);
  const canManage = user.role === "super_admin" || user.role === "event_admin";
  const events = await query<EventRow>(`SELECT e.*,
    (SELECT COUNT(*) FROM sessions s WHERE s.event_id = e.id)::text sessions,
    (SELECT COUNT(*) FROM event_students es WHERE es.event_id = e.id)::text students,
    (SELECT COUNT(*) FROM attendances a WHERE a.event_id = e.id)::text attendances
    FROM events e ORDER BY CASE e.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, e.starts_at DESC`);

  return <>
    <div className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Congresos</h1><p>El sistema opera con un congreso activo, conservando el historial de los anteriores.</p></div></div>
    <div className="event-list">{events.rows.map((event) => <Link href={"/events/" + event.id} className="card event-list-card" key={event.id}>
      <div><span className={event.status === "active" ? "pill pill-live" : "pill"}>{statusLabel[event.status]}</span><h2>{event.name}</h2><p>{event.venue}</p><small>{formatDate(event.starts_at)} – {formatDate(event.ends_at)}</small></div>
      <div className="event-card-metrics"><span><strong>{event.sessions}</strong> sesiones</span><span><strong>{event.students}</strong> alumnos</span><span><strong>{event.attendances}</strong> asistencias</span><b>{canManage ? "Administrar →" : "Ver detalle →"}</b></div>
    </Link>)}</div>
    {events.rows.length === 0 && <div className="card empty"><strong>No hay congresos registrados</strong></div>}
    {canManage && <div className="create-event-section"><p className="eyebrow">CREAR</p><EventForm /></div>}
  </>;
}

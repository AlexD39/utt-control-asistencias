import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, type Role } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { EventForm } from "@/components/event-form";
import { SessionManager } from "@/components/session-manager";
import { EventParticipantsManager, type EventStudent } from "@/components/event-participants-manager";
import { EventStaffManager, type EventStaff } from "@/components/event-staff-manager";

type EventRow = { id: string; name: string; venue: string; starts_at: Date; ends_at: Date; status: "draft" | "active" | "closed" };
type SessionRow = { id: string; name: string; room: string; starts_at: Date; ends_at: Date; active: boolean };
type StudentRow = EventStudent;
type StaffRow = { id: string; name: string; email: string; role: Role };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["super_admin", "event_admin", "viewer"]);
  const { id } = await params;
  const [eventResult, sessionsResult, assignedStudents, availableStudents, assignedStaff, availableStaff] = await Promise.all([
    query<EventRow>(`SELECT e.id, e.name, e.venue, e.starts_at, e.ends_at, e.status FROM events e
      WHERE e.id = $1 AND ($2::boolean OR EXISTS (SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $3))`, [id, user.role === "super_admin", user.id]),
    query<SessionRow>("SELECT id, name, room, starts_at, ends_at, active FROM sessions WHERE event_id = $1 ORDER BY starts_at", [id]),
    query<StudentRow>(`SELECT s.id, s.name, s.enrollment, s.program, s.email FROM students s
      JOIN event_students es ON es.student_id = s.id WHERE es.event_id = $1 ORDER BY s.name`, [id]),
    query<StudentRow>(`SELECT s.id, s.name, s.enrollment, s.program, s.email FROM students s WHERE s.active
      AND NOT EXISTS (SELECT 1 FROM event_students es WHERE es.event_id = $1 AND es.student_id = s.id) ORDER BY s.name`, [id]),
    query<StaffRow>(`SELECT u.id, u.name, u.email, u.role FROM users u JOIN event_staff ef ON ef.user_id = u.id
      WHERE ef.event_id = $1 ORDER BY u.name`, [id]),
    query<StaffRow>(`SELECT u.id, u.name, u.email, u.role FROM users u WHERE u.active
      AND NOT EXISTS (SELECT 1 FROM event_staff ef WHERE ef.event_id = $1 AND ef.user_id = u.id) ORDER BY u.name`, [id])
  ]);
  const event = eventResult.rows[0];
  if (!event) notFound();
  const canManage = user.role === "super_admin" || user.role === "event_admin";

  return <>
    <div className="breadcrumb"><Link href="/events">Congresos</Link><span>→</span><span>{event.name}</span></div>
    <section className="event-banner"><div><span className={event.status === "active" ? "pill pill-live" : "pill"}>{event.status === "active" ? "● ACTIVO" : event.status === "draft" ? "BORRADOR" : "CERRADO"}</span><h2>{event.name}</h2><p>{event.venue} · {formatDate(event.starts_at)} – {formatDate(event.ends_at)}</p></div><div className="event-number"><strong>{sessionsResult.rows.length}</strong><span>sesiones</span></div></section>
    {canManage ? <EventForm event={{ id: event.id, name: event.name, venue: event.venue, startsAt: event.starts_at.toISOString(), endsAt: event.ends_at.toISOString(), status: event.status }} canDelete={user.role === "super_admin"} /> : <div className="card"><p>Tu permiso es de consulta. Puedes revisar el congreso y sus sesiones.</p></div>}
    {canManage ? <SessionManager eventId={event.id} eventStartsAt={event.starts_at.toISOString()} eventEndsAt={event.ends_at.toISOString()} sessions={sessionsResult.rows.map((session) => ({ id: session.id, name: session.name, room: session.room, startsAt: session.starts_at.toISOString(), endsAt: session.ends_at.toISOString(), active: session.active }))} /> : <section className="session-section"><h2>Sesiones</h2><div className="session-grid">{sessionsResult.rows.map((session) => <article className="card session-card" key={session.id}><div><span className={session.active ? "pill pill-success" : "pill"}>{session.active ? "DISPONIBLE" : "INACTIVA"}</span><h3>{session.name}</h3><p>{session.room}</p><small>{formatDate(session.starts_at)} – {formatDate(session.ends_at)}</small></div></article>)}</div></section>}
    {canManage && <EventParticipantsManager eventId={event.id} assigned={assignedStudents.rows} available={availableStudents.rows} />}
    {user.role === "super_admin" && <EventStaffManager eventId={event.id} assigned={assignedStaff.rows as EventStaff[]} available={availableStaff.rows as EventStaff[]} />}
  </>;
}

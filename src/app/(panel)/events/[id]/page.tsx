import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { EventForm } from "@/components/event-form";
import { SessionManager } from "@/components/session-manager";

type EventRow = { id: string; name: string; venue: string; starts_at: Date; ends_at: Date; status: "draft" | "active" | "closed" };
type SessionRow = { id: string; name: string; room: string; starts_at: Date; ends_at: Date; active: boolean };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["super_admin", "event_admin", "viewer"]);
  const { id } = await params;
  const [eventResult, sessionsResult] = await Promise.all([
    query<EventRow>("SELECT id, name, venue, starts_at, ends_at, status FROM events WHERE id = $1", [id]),
    query<SessionRow>("SELECT id, name, room, starts_at, ends_at, active FROM sessions WHERE event_id = $1 ORDER BY starts_at", [id])
  ]);
  const event = eventResult.rows[0];
  if (!event) notFound();
  const canManage = user.role === "super_admin" || user.role === "event_admin";

  return <>
    <div className="breadcrumb"><Link href="/events">Congresos</Link><span>→</span><span>{event.name}</span></div>
    <section className="event-banner"><div><span className={event.status === "active" ? "pill pill-live" : "pill"}>{event.status === "active" ? "● ACTIVO" : event.status === "draft" ? "BORRADOR" : "CERRADO"}</span><h2>{event.name}</h2><p>{event.venue} · {formatDate(event.starts_at)} – {formatDate(event.ends_at)}</p></div><div className="event-number"><strong>{sessionsResult.rows.length}</strong><span>sesiones</span></div></section>
    {canManage ? <EventForm event={{ id: event.id, name: event.name, venue: event.venue, startsAt: event.starts_at.toISOString(), endsAt: event.ends_at.toISOString(), status: event.status }} canDelete={user.role === "super_admin"} /> : <div className="card"><p>Tu permiso es de consulta. Puedes revisar el congreso y sus sesiones.</p></div>}
    {canManage ? <SessionManager eventId={event.id} eventStartsAt={event.starts_at.toISOString()} eventEndsAt={event.ends_at.toISOString()} sessions={sessionsResult.rows.map((session) => ({ id: session.id, name: session.name, room: session.room, startsAt: session.starts_at.toISOString(), endsAt: session.ends_at.toISOString(), active: session.active }))} /> : <section className="session-section"><h2>Sesiones</h2><div className="session-grid">{sessionsResult.rows.map((session) => <article className="card session-card" key={session.id}><div><span className={session.active ? "pill pill-success" : "pill"}>{session.active ? "DISPONIBLE" : "INACTIVA"}</span><h3>{session.name}</h3><p>{session.room}</p><small>{formatDate(session.starts_at)} – {formatDate(session.ends_at)}</small></div></article>)}</div></section>}
  </>;
}

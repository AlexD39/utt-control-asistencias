import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StudentImport } from "@/components/student-import";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { canManageEvent } from "@/lib/event-access";
import { notFound } from "next/navigation";

export default async function ImportStudentsPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const user = await requireUser(["super_admin", "event_admin"]);
  const { eventId } = await searchParams;
  let targetEvent: { id: string; name: string } | undefined;
  if (eventId) {
    if (!(await canManageEvent(user, eventId))) notFound();
    const event = await query<{ id: string; name: string }>("SELECT id, name FROM events WHERE id = $1", [eventId]);
    if (!event.rows[0]) notFound();
    targetEvent = event.rows[0];
  } else {
    const active = await query<{ id: string; name: string }>("SELECT id, name FROM events WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1");
    targetEvent = active.rows[0];
  }
  const activities = targetEvent ? await query<{ id: string; code: string; name: string; session_type: "workshop" | "general"; capacity: number | null; enrolled: number }>(`SELECT s.id, s.code, s.name, s.session_type, s.capacity, COUNT(ss.student_id)::int enrolled
    FROM sessions s LEFT JOIN session_students ss ON ss.session_id = s.id
    WHERE s.event_id = $1 AND s.active
      AND (s.session_type = 'workshop' OR (s.session_type = 'general' AND s.requires_enrollment))
    GROUP BY s.id ORDER BY s.starts_at, s.name`, [targetEvent.id]) : { rows: [] };
  return <>
    <div className="page-heading"><div><p className="eyebrow">PADRÓN · IMPORTACIÓN</p><h1>Importar alumnos desde Excel</h1><p>{targetEvent ? "Se asignarán a " + targetEvent.name + "." : "Carga o actualiza el padrón con un archivo .xlsx o .csv."}</p></div><Link href={eventId ? "/events/" + eventId : "/students"} className="button button-secondary"><ArrowLeft aria-hidden />Volver</Link></div>
    <StudentImport eventId={targetEvent?.id} eventName={targetEvent?.name} activities={activities.rows} returnToEvent={Boolean(eventId)} />
  </>;
}

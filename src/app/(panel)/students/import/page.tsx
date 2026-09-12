import Link from "next/link";
import { StudentImport } from "@/components/student-import";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { canManageEvent } from "@/lib/event-access";
import { notFound } from "next/navigation";

export default async function ImportStudentsPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const user = await requireUser(["super_admin", "event_admin"]);
  const { eventId } = await searchParams;
  let eventName: string | undefined;
  if (eventId) {
    if (!(await canManageEvent(user, eventId))) notFound();
    const event = await query<{ name: string }>("SELECT name FROM events WHERE id = $1", [eventId]);
    if (!event.rows[0]) notFound();
    eventName = event.rows[0].name;
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">PADRÓN · IMPORTACIÓN</p><h1>Importar alumnos</h1><p>{eventName ? "Se asignarán a " + eventName + "." : "Carga o actualiza el padrón utilizando un archivo CSV."}</p></div><Link href={eventId ? "/events/" + eventId : "/students"} className="button button-secondary">← Volver</Link></div>
    <StudentImport eventId={eventId} eventName={eventName} />
  </>;
}

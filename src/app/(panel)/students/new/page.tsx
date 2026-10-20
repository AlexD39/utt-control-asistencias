import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StudentForm } from "@/components/student-form";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resendConfiguration } from "@/lib/email-provider";

export default async function NewStudentPage() {
  const user = await requireUser(["super_admin", "event_admin"]);
  const eventResult = await query<{ id: string; name: string }>(`SELECT e.id, e.name FROM events e
    WHERE e.status = 'active' AND ($1::boolean OR EXISTS (
      SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2
    )) ORDER BY e.starts_at DESC LIMIT 1`, [user.role === "super_admin", user.id]);
  const activeEvent = eventResult.rows[0];
  const workshops = activeEvent ? await query<{ id: string; code: string; name: string; capacity: number | null; enrolled: number }>(`SELECT s.id, s.code, s.name, s.capacity, COUNT(ss.student_id)::int enrolled
    FROM sessions s LEFT JOIN session_students ss ON ss.session_id = s.id
    WHERE s.event_id = $1 AND s.session_type = 'workshop' AND s.active
    GROUP BY s.id ORDER BY s.starts_at`, [activeEvent.id]) : { rows: [] };
  return <><div className="page-heading"><div><p className="eyebrow">PADRÓN / NUEVO</p><h1>Registrar alumno</h1><p>El alta genera una nueva credencial QR y NFC automáticamente.</p></div><Link href="/students" className="button button-secondary"><ArrowLeft aria-hidden />Volver al padrón</Link></div><StudentForm eventName={activeEvent?.name} workshops={workshops.rows} emailProviderConfigured={resendConfiguration().configured} /></>;
}

import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { notFound } from "next/navigation";
import { ReissueCredential } from "@/components/reissue-credential";
import { StudentEditForm } from "@/components/student-edit-form";
import { StudentAccessManager } from "@/components/student-access-manager";
import { StudentCredentialEmail, type StudentEmailDelivery } from "@/components/student-credential-email";
import { StudentEventManager, type StudentEventMembership } from "@/components/student-event-manager";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resendConfiguration } from "@/lib/email-provider";
import { formatDate, initials } from "@/lib/format";

type Student = { id: string; name: string; enrollment: string; email: string | null; program: string; active: boolean; badge_active: boolean | null; issued_at: Date | null; nfc_configured_at: Date | null; nfc_verified_at: Date | null };
type Attendance = { id: string; session_name: string; room: string; scanned_at: Date; source: string };
type StudentAccess = { event_id: string; event_name: string; credential_use_limit: number | null; uses_consumed: number };
type Workshop = { id: string; code: string; name: string; capacity: number | null; enrolled: number; assigned: boolean };
type StudentEventRow = { id: string; name: string; venue: string; status: StudentEventMembership["status"]; attendance_count: number };

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["super_admin", "event_admin", "viewer"]);
  const { id } = await params;
  const [studentResult, attendanceResult] = await Promise.all([
    query<Student>(`SELECT s.id, s.name, s.enrollment, s.email, s.program, s.active,
      b.active badge_active, b.issued_at, b.nfc_configured_at, b.nfc_verified_at FROM students s
      LEFT JOIN LATERAL (SELECT b.active, b.issued_at, b.nfc_configured_at, b.nfc_verified_at FROM badges b
        JOIN events e ON e.id = b.event_id WHERE b.student_id = s.id AND e.status = 'active' ORDER BY b.issued_at DESC LIMIT 1) b ON TRUE
      WHERE s.id = $1 LIMIT 1`, [id]),
    query<Attendance>(`SELECT a.id, se.name session_name, se.room, a.scanned_at, a.source
      FROM attendances a JOIN sessions se ON se.id = a.session_id WHERE a.student_id = $1 ORDER BY a.scanned_at DESC`, [id])
  ]);
  const student = studentResult.rows[0];
  if (!student) notFound();
  const accessResult = await query<StudentAccess>(`SELECT e.id event_id, e.name event_name, es.credential_use_limit,
    (SELECT COUNT(*)::int FROM attendances a JOIN sessions se ON se.id = a.session_id
      WHERE a.event_id = e.id AND a.student_id = es.student_id AND se.consumes_credential_use) uses_consumed
    FROM event_students es JOIN events e ON e.id = es.event_id
    WHERE es.student_id = $1 AND e.status = 'active' ORDER BY e.starts_at DESC LIMIT 1`, [id]);
  const access = accessResult.rows[0];
  const [membershipResult, availableEventResult] = await Promise.all([
    query<StudentEventRow>(`SELECT e.id, e.name, e.venue, e.status::text,
      (SELECT COUNT(*)::int FROM attendances a WHERE a.event_id = e.id AND a.student_id = $1) attendance_count
      FROM event_students es JOIN events e ON e.id = es.event_id
      WHERE es.student_id = $1
        AND ($2::boolean OR EXISTS (SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $3))
      ORDER BY CASE e.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, e.starts_at DESC`, [id, user.role === "super_admin", user.id]),
    user.role !== "viewer" ? query<StudentEventRow>(`SELECT e.id, e.name, e.venue, e.status::text, 0::int attendance_count
      FROM events e WHERE e.status = 'active'
        AND ($1::boolean OR EXISTS (SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2))
        AND NOT EXISTS (SELECT 1 FROM event_students es WHERE es.event_id = e.id AND es.student_id = $3)
      ORDER BY e.starts_at DESC`, [user.role === "super_admin", user.id, id]) : Promise.resolve({ rows: [] as StudentEventRow[] }),
  ]);
  const memberships: StudentEventMembership[] = membershipResult.rows.map((event) => ({ id: event.id, name: event.name, venue: event.venue, status: event.status, attendanceCount: event.attendance_count }));
  const availableActiveEvents: StudentEventMembership[] = availableEventResult.rows.map((event) => ({ id: event.id, name: event.name, venue: event.venue, status: event.status, attendanceCount: 0 }));
  const workshops = access ? await query<Workshop>(`SELECT se.id, se.code, se.name, se.capacity,
    COUNT(ss.student_id)::int enrolled,
    COALESCE(BOOL_OR(ss.student_id = $2), FALSE) assigned
    FROM sessions se LEFT JOIN session_students ss ON ss.session_id = se.id
    WHERE se.event_id = $1 AND se.session_type = 'workshop' AND se.active
    GROUP BY se.id ORDER BY se.starts_at`, [access.event_id, id]) : { rows: [] };
  const deliveryResult = access && student.email ? await query<{ status: StudentEmailDelivery["status"]; recipient: string; sent_at: Date | null; last_error: string | null }>(`SELECT d.status::text, d.recipient, d.sent_at, d.last_error
    FROM credential_email_deliveries d JOIN badges b ON b.id = d.badge_id
    WHERE b.event_id = $1 AND b.student_id = $2 AND b.active
      AND d.recipient = LOWER(BTRIM($3))
    ORDER BY d.updated_at DESC LIMIT 1`, [access.event_id, id, student.email]) : { rows: [] };
  const delivery = deliveryResult.rows[0];
  const initialDelivery: StudentEmailDelivery | null = delivery ? {
    status: delivery.status,
    recipient: delivery.recipient,
    sentAt: delivery.sent_at?.toISOString() ?? null,
    lastError: delivery.last_error,
  } : null;

  return <><div className="page-heading"><div><p className="eyebrow">EXPEDIENTE DEL ALUMNO</p><h1>{student.name}</h1><p>{student.enrollment} · {student.program}</p></div><Link href="/students" className="button button-secondary"><ArrowLeft aria-hidden />Volver al padrón</Link></div>
    <section className="student-profile card"><div className="profile-main"><span className="profile-photo">{initials(student.name)}</span><div><span className={student.active ? "pill pill-success" : "pill"}>{student.active ? "ALUMNO ACTIVO" : "INACTIVO"}</span><h2>{student.name}</h2><p>{student.email ?? "Sin correo registrado"}</p><p className="student-current-event"><CalendarDays aria-hidden />{access?.event_name ?? "Sin congreso activo"}</p></div></div><div className="profile-stats"><div><strong>{attendanceResult.rows.length}</strong><span>asistencias</span></div><div><strong>{student.nfc_verified_at ? "NFC listo" : student.badge_active ? "QR activa" : "Sin activar"}</strong><span>credencial</span></div><div><strong>{student.issued_at ? formatDate(student.issued_at, false) : "—"}</strong><span>última emisión</span></div></div></section>
    {user.role !== "viewer" && <StudentEditForm student={student} />}
    {user.role !== "viewer" && <StudentEventManager studentId={student.id} memberships={memberships} availableActiveEvents={availableActiveEvents} />}
    {user.role !== "viewer" && access && <StudentAccessManager studentId={student.id} eventName={access.event_name} useLimit={access.credential_use_limit} usesConsumed={access.uses_consumed} workshops={workshops.rows} />}
    {user.role !== "viewer" && access && <StudentCredentialEmail studentId={student.id} email={student.email} providerConfigured={resendConfiguration().configured} initialDelivery={initialDelivery} />}
    {user.role !== "viewer" && <ReissueCredential student={{ id: student.id, name: student.name, enrollment: student.enrollment, program: student.program }} nfcVerifiedAt={student.nfc_verified_at?.toISOString()} credentialUseLimit={access?.credential_use_limit} />}
    <section className="card table-card student-history"><div className="table-toolbar"><strong>Historial de asistencia</strong><span className="pill">{attendanceResult.rows.length} REGISTROS</span></div><div className="table-wrap"><table><thead><tr><th>Sesión</th><th>Ubicación</th><th>Fecha</th><th>Método</th></tr></thead><tbody>{attendanceResult.rows.length === 0 ? <tr><td className="empty-cell" colSpan={4}>Este alumno todavía no registra asistencias.</td></tr> : attendanceResult.rows.map((row) => <tr key={row.id}><td><strong>{row.session_name}</strong></td><td>{row.room}</td><td>{formatDate(row.scanned_at)}</td><td><span className="source-tag">{row.source.toUpperCase()}</span></td></tr>)}</tbody></table></div></section>
  </>;
}

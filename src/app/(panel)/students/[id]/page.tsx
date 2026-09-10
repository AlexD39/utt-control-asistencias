import Link from "next/link";
import { notFound } from "next/navigation";
import { ReissueCredential } from "@/components/reissue-credential";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate, initials } from "@/lib/format";

type Student = { id: string; name: string; enrollment: string; email: string | null; program: string; active: boolean; badge_active: boolean | null; issued_at: Date | null };
type Attendance = { id: string; session_name: string; room: string; scanned_at: Date; source: string };

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["super_admin", "event_admin", "viewer"]);
  const { id } = await params;
  const [studentResult, attendanceResult] = await Promise.all([
    query<Student>(`SELECT s.id, s.name, s.enrollment, s.email, s.program, s.active,
      b.active badge_active, b.issued_at FROM students s LEFT JOIN badges b ON b.student_id = s.id WHERE s.id = $1 LIMIT 1`, [id]),
    query<Attendance>(`SELECT a.id, se.name session_name, se.room, a.scanned_at, a.source
      FROM attendances a JOIN sessions se ON se.id = a.session_id WHERE a.student_id = $1 ORDER BY a.scanned_at DESC`, [id])
  ]);
  const student = studentResult.rows[0];
  if (!student) notFound();

  return <><div className="page-heading"><div><p className="eyebrow">EXPEDIENTE DEL ALUMNO</p><h1>{student.name}</h1><p>{student.enrollment} · {student.program}</p></div><Link href="/students" className="button button-secondary">← Volver al padrón</Link></div>
    <section className="student-profile card"><div className="profile-main"><span className="profile-photo">{initials(student.name)}</span><div><span className={student.active ? "pill pill-success" : "pill"}>{student.active ? "ALUMNO ACTIVO" : "INACTIVO"}</span><h2>{student.name}</h2><p>{student.email ?? "Sin correo registrado"}</p></div></div><div className="profile-stats"><div><strong>{attendanceResult.rows.length}</strong><span>asistencias</span></div><div><strong>{student.badge_active ? "Activa" : "Sin activar"}</strong><span>credencial</span></div><div><strong>{student.issued_at ? formatDate(student.issued_at, false) : "—"}</strong><span>última emisión</span></div></div></section>
    <ReissueCredential student={{ id: student.id, name: student.name, enrollment: student.enrollment, program: student.program }} />
    <section className="card table-card student-history"><div className="table-toolbar"><strong>Historial de asistencia</strong><span className="pill">{attendanceResult.rows.length} REGISTROS</span></div><div className="table-wrap"><table><thead><tr><th>Sesión</th><th>Ubicación</th><th>Fecha</th><th>Método</th></tr></thead><tbody>{attendanceResult.rows.length === 0 ? <tr><td className="empty-cell" colSpan={4}>Este alumno todavía no registra asistencias.</td></tr> : attendanceResult.rows.map((row) => <tr key={row.id}><td><strong>{row.session_name}</strong></td><td>{row.room}</td><td>{formatDate(row.scanned_at)}</td><td><span className="source-tag">{row.source.toUpperCase()}</span></td></tr>)}</tbody></table></div></section>
  </>;
}

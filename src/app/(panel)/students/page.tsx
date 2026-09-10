import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { initials } from "@/lib/format";

type Student = { id: string; name: string; enrollment: string; email: string | null; program: string; active: boolean; badge: string | null };

export default async function StudentsPage() {
  await requireUser(["super_admin", "event_admin", "viewer"]);
  const { rows } = await query<Student>(`SELECT s.id, s.name, s.enrollment, s.email, s.program, s.active, b.label badge
    FROM students s LEFT JOIN badges b ON b.student_id = s.id ORDER BY s.name`);
  return <><div className="page-heading"><div><p className="eyebrow">PADRÓN</p><h1>Alumnos</h1><p>{rows.length} participantes registrados en el entorno local.</p></div><div className="heading-actions"><a className="button button-secondary" href="/api/students/export">↓ Exportar CSV</a><Link className="button button-primary" href="/students/new">＋ Registrar alumno</Link></div></div>
    <section className="card table-card"><div className="table-wrap"><table><thead><tr><th>Participante</th><th>Programa</th><th>Gafete</th><th>Estado</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="person-cell"><span className="avatar avatar-small">{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.enrollment} · {row.email}</small></div></div></td><td>{row.program}</td><td>{row.badge ?? "Sin asignar"}</td><td><span className={row.active ? "pill pill-success" : "pill"}>{row.active ? "ACTIVO" : "INACTIVO"}</span></td><td><Link className="table-action" href={"/students/" + row.id}>Ver expediente →</Link></td></tr>)}</tbody></table></div></section></>;
}

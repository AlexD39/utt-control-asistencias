import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { initials } from "@/lib/format";
import { buildStudentWhere, normalizeStudentFilters } from "@/lib/student-query";

type Student = {
  id: string;
  name: string;
  enrollment: string;
  email: string | null;
  program: string;
  active: boolean;
  badge: string | null;
  badge_active: boolean | null;
};

export default async function StudentsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; program?: string; status?: string; credential?: string }>;
}) {
  const user = await requireUser(["super_admin", "event_admin", "viewer"]);
  const canManage = user.role === "super_admin" || user.role === "event_admin";
  const rawFilters = await searchParams;
  const filters = normalizeStudentFilters(rawFilters);
  const where = buildStudentWhere(filters);
  const baseSql =
    "SELECT s.id, s.name, s.enrollment, s.email, s.program, s.active, b.label badge, b.active badge_active " +
    "FROM students s LEFT JOIN LATERAL (SELECT id, label, active FROM badges WHERE student_id = s.id ORDER BY issued_at DESC LIMIT 1) b ON TRUE ";
  const [studentsResult, programsResult] = await Promise.all([
    query<Student>(baseSql + where.sql + " ORDER BY s.name", where.values),
    query<{ program: string }>("SELECT DISTINCT program FROM students ORDER BY program")
  ]);
  const exportParams = new URLSearchParams();
  if (filters.q) exportParams.set("q", filters.q);
  if (filters.program) exportParams.set("program", filters.program);
  if (filters.status) exportParams.set("status", filters.status);
  if (filters.credential) exportParams.set("credential", filters.credential);
  const exportUrl = "/api/students/export" + (exportParams.size ? "?" + exportParams.toString() : "");

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">PADRÓN</p><h1>Alumnos</h1><p>{studentsResult.rows.length} participantes coinciden con la consulta.</p></div>
      <div className="heading-actions">
        <a className="button button-secondary" href={exportUrl}>↓ Exportar CSV</a>
        {canManage && <Link className="button button-secondary" href="/students/import">↑ Importar CSV</Link>}
        {canManage && <Link className="button button-primary" href="/students/new">＋ Registrar alumno</Link>}
      </div>
    </div>
    <form className="student-filters card" method="get">
      <label className="filter-search">Buscar<input name="q" defaultValue={filters.q} placeholder="Nombre, matrícula o correo" /></label>
      <label>Programa<select name="program" defaultValue={filters.program}><option value="">Todos</option>{programsResult.rows.map((row) => <option key={row.program}>{row.program}</option>)}</select></label>
      <label>Estado<select name="status" defaultValue={filters.status}><option value="">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
      <label>Credencial<select name="credential" defaultValue={filters.credential}><option value="">Todas</option><option value="assigned">Asignada</option><option value="unassigned">Sin asignar</option></select></label>
      <button className="button button-primary">Aplicar</button>
      <Link href="/students" className="button button-secondary">Limpiar</Link>
    </form>
    <section className="card table-card">
      <div className="table-wrap"><table><thead><tr><th>Participante</th><th>Programa</th><th>Credencial</th><th>Estado</th><th></th></tr></thead><tbody>
        {studentsResult.rows.length === 0 ? <tr><td colSpan={5} className="empty-cell">No se encontraron alumnos con estos filtros.</td></tr> : studentsResult.rows.map((row) => <tr key={row.id}>
          <td><div className="person-cell"><span className="avatar avatar-small">{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.enrollment} · {row.email ?? "Sin correo"}</small></div></div></td>
          <td>{row.program}</td>
          <td>{row.badge ? <span className={row.badge_active ? "pill pill-success" : "pill"}>{row.badge_active ? row.badge : "INACTIVA"}</span> : "Sin asignar"}</td>
          <td><span className={row.active ? "pill pill-success" : "pill"}>{row.active ? "ACTIVO" : "INACTIVO"}</span></td>
          <td><Link className="table-action" href={"/students/" + row.id}>Ver expediente →</Link></td>
        </tr>)}
      </tbody></table></div>
    </section>
  </>;
}

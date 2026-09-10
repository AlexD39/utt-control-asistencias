import { requireUser, roleLabel, type Role } from "@/lib/auth";
import { query } from "@/lib/db";
import { initials } from "@/lib/format";

type UserRow = { id: string; name: string; email: string; role: Role; active: boolean };

export default async function UsersPage() {
  await requireUser(["super_admin"]);
  const { rows } = await query<UserRow>("SELECT id, name, email, role, active FROM users ORDER BY created_at");
  return <><div className="page-heading"><div><p className="eyebrow">SUPERADMINISTRACIÓN</p><h1>Equipo y permisos</h1><p>Controla quién puede operar y consultar el evento.</p></div><button className="button button-primary">＋ Agregar integrante</button></div>
    <section className="role-grid"><div className="role-card"><strong>Superadministración</strong><p>Control total, usuarios, eventos y auditoría.</p></div><div className="role-card"><strong>Administración de evento</strong><p>Gestiona alumnos, sesiones y resultados.</p></div><div className="role-card"><strong>Registro</strong><p>Únicamente registra entradas asignadas.</p></div></section>
    <section className="card table-card"><div className="table-wrap"><table><thead><tr><th>Integrante</th><th>Permiso</th><th>Estado</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="person-cell"><span className="avatar avatar-small">{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.email}</small></div></div></td><td>{roleLabel(row.role)}</td><td><span className={row.active ? "pill pill-success" : "pill"}>{row.active ? "ACTIVO" : "INACTIVO"}</span></td></tr>)}</tbody></table></div></section></>;
}

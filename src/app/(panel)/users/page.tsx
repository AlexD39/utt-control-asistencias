import { requireUser, type Role } from "@/lib/auth";
import { query } from "@/lib/db";
import { UserManager, type ManagedUser } from "@/components/user-manager";

type UserRow = ManagedUser & { role: Role };

export default async function UsersPage() {
  const currentUser = await requireUser(["super_admin", "event_admin"]);
  const { rows } = await query<UserRow>(`SELECT u.id, u.name, u.email, u.role, u.active,
    COUNT(ef.event_id)::text events FROM users u LEFT JOIN event_staff ef ON ef.user_id = u.id
    GROUP BY u.id ORDER BY u.created_at`);
  return <><div className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Equipo y permisos</h1><p>Crea las cuentas que operarán los teléfonos durante el congreso.</p></div></div>
    <section className="role-grid"><div className="role-card"><strong>Superadministración</strong><p>Control total, usuarios, congresos y auditoría.</p></div><div className="role-card"><strong>Administración</strong><p>Control total para gestionar usuarios, congresos, alumnos, credenciales y asistencias.</p></div><div className="role-card"><strong>Registro</strong><p>Registra asistencias en congresos asignados.</p></div><div className="role-card"><strong>Consulta</strong><p>Revisa padrones y resultados sin modificarlos.</p></div></section>
    <UserManager users={rows} currentUserId={currentUser.id} />
  </>;
}

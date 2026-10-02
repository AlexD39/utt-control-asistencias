"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/auth";
import { initials } from "@/lib/format";

export type ManagedUser = { id: string; name: string; email: string; role: Role; active: boolean; events: string };
const roleNames: Record<Role, string> = { super_admin: "Superadministración", event_admin: "Administración de evento", scanner: "Registro", viewer: "Consulta" };

export function UserManager({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = users.find((user) => user.id === editing);
  const resetUser = users.find((user) => user.id === resetting);
  const filtered = useMemo(() => users.filter((user) => {
    const term = search.trim().toLowerCase();
    return (!term || (user.name + " " + user.email).toLowerCase().includes(term)) && (!roleFilter || user.role === roleFilter);
  }), [users, search, roleFilter]);

  function clearFeedback() { setError(""); setMessage(""); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const creating = editing === "new";
    const response = await fetch(creating ? "/api/users" : "/api/users/" + editing, {
      method: creating ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"), email: form.get("email"),
        role: selected?.id === currentUserId ? selected.role : form.get("role"),
        active: selected?.id === currentUserId ? selected.active : form.get("active") === "on",
        ...(creating ? { password: form.get("password") } : {})
      })
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar el usuario");
    setEditing(null);
    setMessage(creating ? "Usuario creado con los accesos de su rol." : "Usuario y accesos actualizados correctamente.");
    router.refresh();
  }

  async function updateActive(user: ManagedUser) {
    clearFeedback();
    setLoading(true);
    const response = await fetch("/api/users/" + user.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: user.name, email: user.email, role: user.role, active: !user.active }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible cambiar el estado");
    setMessage(user.active ? "Usuario desactivado." : "Usuario activado.");
    router.refresh();
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmation")) return setError("Las contraseñas no coinciden");
    setLoading(true);
    const response = await fetch("/api/users/" + resetting + "/password", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible cambiar la contraseña");
    setResetting(null);
    setMessage("Contraseña actualizada correctamente.");
  }

  async function remove(user: ManagedUser) {
    if (!confirm("¿Eliminar definitivamente a " + user.name + "?")) return;
    clearFeedback();
    setLoading(true);
    const response = await fetch("/api/users/" + user.id, { method: "DELETE" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible eliminar el usuario");
    setMessage("Usuario eliminado correctamente.");
    router.refresh();
  }

  const formUser = selected ?? (editing === "new" ? { name: "", email: "", role: "scanner" as Role, active: true } : null);
  return <>
    <div className="user-toolbar card"><div className="user-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o correo" /><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">Todos los permisos</option>{Object.entries(roleNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><button className="button button-primary" onClick={() => { setEditing("new"); setResetting(null); clearFeedback(); }}>＋ Agregar integrante</button></div>
    {formUser && <form key={editing} className="card entity-form user-form" onSubmit={save}><div className="card-head"><div><h2>{selected ? "Editar integrante" : "Nuevo integrante"}</h2><p>El rol habilita automáticamente sus funciones y el acceso a los congresos.</p></div></div><div className="form-grid"><label>Nombre completo<input name="name" defaultValue={formUser.name} required /></label><label>Correo electrónico<input name="email" type="email" defaultValue={formUser.email} required /></label><label>Permiso<select name="role" defaultValue={formUser.role} disabled={selected?.id === currentUserId}>{Object.entries(roleNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{!selected && <label>Contraseña temporal<input name="password" type="password" minLength={8} required /><small>Mínimo 8 caracteres, con letras y números.</small></label>}</div><label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={formUser.active} disabled={selected?.id === currentUserId} /><span>Usuario activo</span></label>{selected?.id === currentUserId && <p className="helper">Tu propio permiso y estado están protegidos para evitar que pierdas el acceso.</p>}{error && <div className="alert alert-error">{error}</div>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={loading}>{loading ? "Guardando…" : "Guardar usuario"}</button></div></form>}
    {resetUser && <form className="card entity-form password-form" onSubmit={resetPassword}><div className="card-head"><div><h2>Nueva contraseña</h2><p>{resetUser.name} · {resetUser.email}</p></div></div><div className="form-grid"><label>Nueva contraseña<input name="password" type="password" minLength={8} required /></label><label>Confirmar contraseña<input name="confirmation" type="password" minLength={8} required /></label></div>{error && <div className="alert alert-error">{error}</div>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setResetting(null)}>Cancelar</button><button className="button button-primary" disabled={loading}>Actualizar contraseña</button></div></form>}
    {!formUser && !resetUser && error && <div className="alert alert-error feedback-banner">{error}</div>}{message && <div className="success-banner feedback-banner"><span>✓</span><strong>{message}</strong></div>}
    <section className="card table-card"><div className="table-wrap"><table><thead><tr><th>Integrante</th><th>Permiso</th><th>Congresos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><div className="person-cell"><span className="avatar avatar-small">{initials(user.name)}</span><div><strong>{user.name}{user.id === currentUserId ? " (tú)" : ""}</strong><small>{user.email}</small></div></div></td><td>{roleNames[user.role]}</td><td>{user.role === "super_admin" ? "Todos" : user.events}</td><td><span className={user.active ? "pill pill-success" : "pill"}>{user.active ? "ACTIVO" : "INACTIVO"}</span></td><td><div className="table-actions"><button onClick={() => { setEditing(user.id); setResetting(null); clearFeedback(); }}>Editar</button><button onClick={() => { setResetting(user.id); setEditing(null); clearFeedback(); }}>Contraseña</button>{user.id !== currentUserId && <button onClick={() => updateActive(user)} disabled={loading}>{user.active ? "Desactivar" : "Activar"}</button>}{user.id !== currentUserId && <button className="text-danger" onClick={() => remove(user)} disabled={loading}>Eliminar</button>}</div></td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="empty"><strong>No hay usuarios con esos filtros</strong></div>}</section>
  </>;
}

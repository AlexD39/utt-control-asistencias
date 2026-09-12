"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/format";
import type { Role } from "@/lib/auth";

export type EventStaff = { id: string; name: string; email: string; role: Role };
const roleNames: Record<Role, string> = { super_admin: "Superadministración", event_admin: "Administración", scanner: "Registro", viewer: "Consulta" };

export function EventStaffManager({ eventId, assigned, available }: { eventId: string; assigned: EventStaff[]; available: EventStaff[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function assign() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/events/" + eventId + "/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds: selected }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible asignar el personal");
    setSelected([]);
    router.refresh();
  }

  async function remove(person: EventStaff) {
    if (!confirm("¿Retirar a " + person.name + " del equipo de este congreso?")) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/events/" + eventId + "/staff/" + person.id, { method: "DELETE" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible retirar al integrante");
    router.refresh();
  }

  return <section className="assignment-section">
    <div className="section-heading"><div><p className="eyebrow">OPERACIÓN</p><h2>Personal asignado</h2><p>Solo este equipo verá las sesiones activas en el escáner.</p></div></div>
    <div className="assignment-layout staff-layout">
      <div className="card assignment-picker"><h3>Agregar integrantes</h3><div className="selection-list">{available.map((person) => <label className="selection-item" key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} /><span><strong>{person.name}</strong><small>{roleNames[person.role]} · {person.email}</small></span></label>)}</div>{available.length === 0 && <p className="empty-note">Todo el personal activo ya está asignado.</p>}{error && <div className="alert alert-error">{error}</div>}<button className="button button-primary" onClick={assign} disabled={!selected.length || loading}>Asignar seleccionados ({selected.length})</button></div>
      <div className="card table-card"><div className="table-wrap"><table><thead><tr><th>Integrante</th><th>Permiso</th><th></th></tr></thead><tbody>{assigned.map((person) => <tr key={person.id}><td><div className="person-cell"><span className="avatar avatar-small">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.email}</small></div></div></td><td>{roleNames[person.role]}</td><td><button className="text-danger" onClick={() => remove(person)} disabled={loading}>Retirar</button></td></tr>)}</tbody></table></div></div>
    </div>
  </section>;
}

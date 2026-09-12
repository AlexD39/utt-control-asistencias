"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/format";

export type EventStudent = { id: string; name: string; enrollment: string; program: string; email: string | null };

export function EventParticipantsManager({ eventId, assigned, available }: { eventId: string; assigned: EventStudent[]; available: EventStudent[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return available.slice(0, 30);
    return available.filter((student) => (student.name + " " + student.enrollment + " " + student.program).toLowerCase().includes(term)).slice(0, 30);
  }, [available, search]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function assign() {
    if (!selected.length) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/events/" + eventId + "/students", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentIds: selected }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible asignar los alumnos");
    setSelected([]);
    router.refresh();
  }

  async function remove(student: EventStudent) {
    if (!confirm("¿Retirar a " + student.name + " de este congreso?")) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/events/" + eventId + "/students/" + student.id, { method: "DELETE" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible retirar al alumno");
    router.refresh();
  }

  return <section className="assignment-section">
    <div className="section-heading"><div><p className="eyebrow">PADRÓN DEL CONGRESO</p><h2>Alumnos asignados</h2><p>{assigned.length} participantes forman parte de este congreso.</p></div><Link className="button button-secondary" href={"/students/import?eventId=" + eventId}>↑ Importar CSV aquí</Link></div>
    <div className="assignment-layout">
      <div className="card assignment-picker"><h3>Agregar alumnos existentes</h3><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, matrícula o carrera" />
        <div className="selection-list">{filtered.map((student) => <label className="selection-item" key={student.id}><input type="checkbox" checked={selected.includes(student.id)} onChange={() => toggle(student.id)} /><span><strong>{student.name}</strong><small>{student.enrollment} · {student.program}</small></span></label>)}</div>
        {available.length === 0 && <p className="empty-note">Todos los alumnos activos ya están asignados.</p>}
        {available.length > 30 && !search && <small className="list-note">Mostrando los primeros 30. Usa la búsqueda para localizar otro alumno.</small>}
        {error && <div className="alert alert-error">{error}</div>}
        <button className="button button-primary" onClick={assign} disabled={!selected.length || loading}>{loading ? "Asignando…" : "Asignar seleccionados (" + selected.length + ")"}</button>
      </div>
      <div className="card table-card"><div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Programa</th><th></th></tr></thead><tbody>{assigned.map((student) => <tr key={student.id}><td><div className="person-cell"><span className="avatar avatar-small">{initials(student.name)}</span><div><strong>{student.name}</strong><small>{student.enrollment}</small></div></div></td><td>{student.program}</td><td><button className="text-danger" onClick={() => remove(student)} disabled={loading}>Retirar</button></td></tr>)}</tbody></table></div>{assigned.length === 0 && <div className="empty"><strong>Sin alumnos asignados</strong></div>}</div>
    </div>
  </section>;
}

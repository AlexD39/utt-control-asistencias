"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Modal } from "@/components/modal";

export type SessionData = {
  id: string; code: string; name: string; room: string; startsAt: string; endsAt: string; active: boolean;
  sessionType: "general" | "workshop" | "access"; capacity: number | null; requiresEnrollment: boolean;
  consumesCredentialUse: boolean; studentIds: string[];
};
type StudentOption = { id: string; name: string; enrollment: string; program: string };

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function SessionManager({ eventId, eventStartsAt, eventEndsAt, sessions, students }: {
  eventId: string; eventStartsAt: string; eventEndsAt: string; sessions: SessionData[]; students: StudentOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = sessions.find((session) => session.id === editing);
  const assignmentSession = sessions.find((session) => session.id === assigning);
  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? students.filter((student) => `${student.name} ${student.enrollment} ${student.program}`.toLowerCase().includes(term)) : students;
  }, [search, students]);

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(formEvent.currentTarget);
    const creating = editing === "new";
    const capacityValue = String(form.get("capacity") ?? "").trim();
    const response = await fetch(creating ? `/api/events/${eventId}/sessions` : `/api/sessions/${editing}`, {
      method: creating ? "POST" : "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"), name: form.get("name"), room: form.get("room"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(), sessionType: form.get("sessionType"),
        capacity: capacityValue ? Number(capacityValue) : null,
        requiresEnrollment: form.get("requiresEnrollment") === "on",
        consumesCredentialUse: form.get("consumesCredentialUse") === "on", active: form.get("active") === "on"
      })
    });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar la actividad");
    setEditing(null); router.refresh();
  }

  async function updateActive(session: SessionData) {
    setLoading(true); setError("");
    const response = await fetch(`/api/sessions/${session.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...session, active: !session.active }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible cambiar el estado");
    router.refresh();
  }

  async function saveAssignments() {
    if (!assignmentSession) return;
    setLoading(true); setError("");
    const response = await fetch(`/api/sessions/${assignmentSession.id}/students`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentIds: selectedStudents }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar las inscripciones");
    setAssigning(null); router.refresh();
  }

  async function remove(session: SessionData) {
    if (!confirm(`¿Eliminar la actividad ${session.name}?`)) return;
    setLoading(true); setError("");
    const response = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible eliminar la actividad");
    router.refresh();
  }

  function openAssignments(session: SessionData) {
    setAssigning(session.id); setSelectedStudents(session.studentIds); setSearch(""); setError(""); setEditing(null);
  }
  function toggleStudent(id: string) {
    setSelectedStudents((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  const formSession = selected ?? (editing === "new" ? {
    code: "", name: "", room: "", startsAt: eventStartsAt, endsAt: eventEndsAt, active: true,
    sessionType: "workshop" as const, capacity: null, requiresEnrollment: true, consumesCredentialUse: true, studentIds: []
  } : null);

  return <section className="session-section">
    <div className="section-heading"><div><p className="eyebrow">AGENDA Y TALLERES</p><h2>Actividades del congreso</h2><p>Configura talleres, cupos, inscripciones y consumo de la credencial.</p></div><button className="button button-primary" onClick={() => { setEditing("new"); setAssigning(null); setError(""); }}><Plus aria-hidden />Nueva actividad</button></div>
    <Modal open={Boolean(formSession)} title={selected ? "Editar actividad" : "Nueva actividad"} description="Configura horario, cupo y reglas de acceso." onClose={() => !loading && setEditing(null)} wide>{formSession && <form key={editing} className="entity-form session-form" onSubmit={save}>
      <div className="form-grid">
        <label>Clave<input name="code" defaultValue={formSession.code} placeholder="Ej. IA-01" required /></label>
        <label>Tipo<select name="sessionType" defaultValue={formSession.sessionType}><option value="workshop">Taller</option><option value="general">Sesión general</option><option value="access">Acceso</option></select></label>
        <label>Nombre<input name="name" defaultValue={formSession.name} required /></label>
        <label>Sala o acceso<input name="room" defaultValue={formSession.room} required /></label>
        <label>Inicio<input name="startsAt" type="datetime-local" defaultValue={localDateTime(formSession.startsAt)} required /></label>
        <label>Término<input name="endsAt" type="datetime-local" defaultValue={localDateTime(formSession.endsAt)} required /></label>
        <label>Cupo máximo<input name="capacity" type="number" min="1" max="10000" defaultValue={formSession.capacity ?? ""} placeholder="Sin límite" /></label>
      </div>
      <div className="checkbox-grid">
        <label className="checkbox-field"><input name="requiresEnrollment" type="checkbox" defaultChecked={formSession.requiresEnrollment} /><span>Requiere inscripción previa</span></label>
        <label className="checkbox-field"><input name="consumesCredentialUse" type="checkbox" defaultChecked={formSession.consumesCredentialUse} /><span>Consume un uso de la credencial</span></label>
        <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={formSession.active} /><span>Disponible para registrar asistencia</span></label>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={loading}>{loading ? "Guardando…" : "Guardar actividad"}</button></div>
    </form>}</Modal>
    <Modal open={Boolean(assignmentSession)} title={assignmentSession ? `Alumnos de ${assignmentSession.name}` : "Alumnos del taller"} description={assignmentSession ? `${selectedStudents.length}${assignmentSession.capacity ? ` de ${assignmentSession.capacity}` : ""} inscritos` : undefined} onClose={() => !loading && setAssigning(null)} wide>{assignmentSession && <div className="workshop-assignment">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, matrícula o carrera" />
      <div className="selection-list workshop-selection">{filteredStudents.map((student) => <label className="selection-item" key={student.id}><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={() => toggleStudent(student.id)} /><span><strong>{student.name}</strong><small>{student.enrollment} · {student.program}</small></span></label>)}</div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions"><button className="button button-secondary" onClick={() => setAssigning(null)}>Cancelar</button><button className="button button-primary" onClick={saveAssignments} disabled={loading}>{loading ? "Guardando…" : "Guardar inscripciones"}</button></div>
    </div>}</Modal>
    {!formSession && !assignmentSession && error && <div className="alert alert-error">{error}</div>}
    <div className="session-grid">{sessions.map((session) => <article className="card session-card" key={session.id}>
      <div><div className="session-badges"><span className={session.active ? "pill pill-success" : "pill"}>{session.active ? "DISPONIBLE" : "INACTIVA"}</span><span className="pill">{session.sessionType === "workshop" ? "TALLER" : session.sessionType === "access" ? "ACCESO" : "GENERAL"}</span></div><h3>{session.name}</h3><p><strong>{session.code}</strong> · {session.room}</p><small>{formatDate(session.startsAt)} – {formatDate(session.endsAt)}</small><div className="session-meta"><span>{session.studentIds.length}{session.capacity ? `/${session.capacity}` : ""} inscritos</span><span>{session.requiresEnrollment ? "Inscripción obligatoria" : "Acceso abierto"}</span><span>{session.consumesCredentialUse ? "Consume uso" : "No consume uso"}</span></div></div>
      <div className="session-actions"><button className="button button-secondary" onClick={() => openAssignments(session)}><Users aria-hidden />Alumnos</button><button className="button button-secondary" onClick={() => { setEditing(session.id); setAssigning(null); setError(""); }}>Editar</button><button className="button button-secondary" onClick={() => updateActive(session)} disabled={loading}>{session.active ? "Desactivar" : "Activar"}</button><button className="button button-danger button-icon" title="Eliminar" aria-label={`Eliminar ${session.name}`} onClick={() => remove(session)} disabled={loading}><Trash2 aria-hidden /></button></div>
    </article>)}</div>
    {sessions.length === 0 && !formSession && <div className="card empty"><strong>No hay actividades todavía</strong><p>Crea una sesión o taller para habilitar el registro de asistencias.</p></div>}
  </section>;
}

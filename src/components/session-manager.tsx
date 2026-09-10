"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

export type SessionData = { id: string; name: string; room: string; startsAt: string; endsAt: string; active: boolean };

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function SessionManager({ eventId, eventStartsAt, eventEndsAt, sessions }: {
  eventId: string; eventStartsAt: string; eventEndsAt: string; sessions: SessionData[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = sessions.find((session) => session.id === editing);

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(formEvent.currentTarget);
    const creating = editing === "new";
    const response = await fetch(creating ? "/api/events/" + eventId + "/sessions" : "/api/sessions/" + editing, {
      method: creating ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"), room: form.get("room"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(),
        active: form.get("active") === "on"
      })
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar la sesión");
    setEditing(null);
    router.refresh();
  }

  async function updateActive(session: SessionData) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/sessions/" + session.id, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...session, active: !session.active })
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible cambiar el estado");
    router.refresh();
  }

  async function remove(session: SessionData) {
    if (!confirm("¿Eliminar la sesión " + session.name + "?")) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/sessions/" + session.id, { method: "DELETE" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible eliminar la sesión");
    router.refresh();
  }

  const formSession = selected ?? (editing === "new" ? { name: "", room: "", startsAt: eventStartsAt, endsAt: eventEndsAt, active: true } : null);
  return <section className="session-section">
    <div className="section-heading"><div><p className="eyebrow">AGENDA</p><h2>Sesiones del congreso</h2><p>Estas son las opciones disponibles en el escáner de asistencia.</p></div><button className="button button-primary" onClick={() => { setEditing("new"); setError(""); }}>＋ Nueva sesión</button></div>
    {formSession && <form key={editing} className="card entity-form session-form" onSubmit={save}>
      <div className="card-head"><h2>{selected ? "Editar sesión" : "Nueva sesión"}</h2></div>
      <div className="form-grid">
        <label>Nombre<input name="name" defaultValue={formSession.name} required /></label>
        <label>Sala o acceso<input name="room" defaultValue={formSession.room} required /></label>
        <label>Inicio<input name="startsAt" type="datetime-local" defaultValue={localDateTime(formSession.startsAt)} required /></label>
        <label>Término<input name="endsAt" type="datetime-local" defaultValue={localDateTime(formSession.endsAt)} required /></label>
      </div>
      <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={formSession.active} /><span>Disponible para registrar asistencia</span></label>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={loading}>{loading ? "Guardando…" : "Guardar sesión"}</button></div>
    </form>}
    {!formSession && error && <div className="alert alert-error">{error}</div>}
    <div className="session-grid">{sessions.map((session) => <article className="card session-card" key={session.id}>
      <div><span className={session.active ? "pill pill-success" : "pill"}>{session.active ? "DISPONIBLE" : "INACTIVA"}</span><h3>{session.name}</h3><p>{session.room}</p><small>{formatDate(session.startsAt)} – {formatDate(session.endsAt)}</small></div>
      <div className="session-actions"><button className="button button-secondary" onClick={() => { setEditing(session.id); setError(""); }}>Editar</button><button className="button button-secondary" onClick={() => updateActive(session)} disabled={loading}>{session.active ? "Desactivar" : "Activar"}</button><button className="button button-danger button-icon" title="Eliminar" onClick={() => remove(session)} disabled={loading}>×</button></div>
    </article>)}</div>
    {sessions.length === 0 && !formSession && <div className="card empty"><strong>No hay sesiones todavía</strong><p>Crea la primera para habilitar el registro de asistencias.</p></div>}
  </section>;
}

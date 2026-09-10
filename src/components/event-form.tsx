"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type EventData = {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  status: "draft" | "active" | "closed";
};

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function EventForm({ event, canDelete = false }: { event?: EventData; canDelete?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(formEvent.currentTarget);
    const response = await fetch(event ? "/api/events/" + event.id : "/api/events", {
      method: event ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        venue: form.get("venue"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(),
        status: form.get("status")
      })
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar el congreso");
    if (!event) router.push("/events/" + result.id);
    router.refresh();
  }

  async function remove() {
    if (!event || !confirm("¿Eliminar este congreso? Solo es posible si todavía no tiene información asociada.")) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/events/" + event.id, { method: "DELETE" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible eliminar el congreso");
    router.push("/events");
    router.refresh();
  }

  return <form className="card entity-form" onSubmit={submit}>
    <div className="card-head"><div><h2>{event ? "Información del congreso" : "Nuevo congreso"}</h2><p>Al activar uno, cualquier congreso activo anterior se cerrará automáticamente.</p></div></div>
    <div className="form-grid">
      <label>Nombre<input name="name" defaultValue={event?.name} placeholder="Ej. Congreso UTT 2027" required /></label>
      <label>Sede<input name="venue" defaultValue={event?.venue} placeholder="Ej. Auditorio principal" required /></label>
      <label>Fecha y hora de inicio<input name="startsAt" type="datetime-local" defaultValue={event ? localDateTime(event.startsAt) : ""} required /></label>
      <label>Fecha y hora de término<input name="endsAt" type="datetime-local" defaultValue={event ? localDateTime(event.endsAt) : ""} required /></label>
      <label>Estado<select name="status" defaultValue={event?.status ?? "draft"}><option value="draft">Borrador</option><option value="active">Activo</option><option value="closed">Cerrado</option></select></label>
    </div>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="form-actions">
      {event && canDelete && <button type="button" className="button button-danger" onClick={remove} disabled={loading}>Eliminar congreso</button>}
      <button className="button button-primary" disabled={loading}>{loading ? "Guardando…" : event ? "Guardar cambios" : "Crear congreso"}</button>
    </div>
  </form>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Settings2, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";

export type StudentEventMembership = {
  id: string;
  name: string;
  venue: string;
  status: "draft" | "active" | "closed";
  attendanceCount: number;
};

const statusLabel = { draft: "BORRADOR", active: "ACTIVO", closed: "CERRADO" };

export function StudentEventManager({
  studentId,
  memberships,
  availableActiveEvents,
}: {
  studentId: string;
  memberships: StudentEventMembership[];
  availableActiveEvents: StudentEventMembership[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function assign(event: StudentEventMembership) {
    setLoadingId(event.id);
    setError("");
    setMessage("");
    const response = await fetch(`/api/events/${event.id}/students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentIds: [studentId] }),
    });
    const result = await response.json();
    if (!response.ok) {
      setLoadingId(null);
      setError(result.error ?? "No fue posible asignar el congreso");
      return;
    }

    const credentialResponse = await fetch(`/api/students/${studentId}/credential`, { method: "POST" });
    const credentialResult = await credentialResponse.json();
    setLoadingId(null);
    if (!credentialResponse.ok) {
      setError(credentialResult.error ?? "El congreso fue asignado, pero no se pudo generar la credencial");
      router.refresh();
      return;
    }
    setMessage(`Alumno asignado a ${event.name} con una credencial nueva.`);
    router.refresh();
  }

  async function remove(event: StudentEventMembership) {
    if (!window.confirm(`¿Retirar al alumno de ${event.name}? La credencial de ese congreso dejará de funcionar.`)) return;
    setLoadingId(event.id);
    setError("");
    setMessage("");
    const response = await fetch(`/api/events/${event.id}/students/${studentId}`, { method: "DELETE" });
    const result = await response.json();
    setLoadingId(null);
    if (!response.ok) {
      setError(result.error ?? "No fue posible retirar al alumno del congreso");
      return;
    }
    setMessage(`Alumno retirado de ${event.name}.`);
    router.refresh();
  }

  return <section className="credential-action event-membership-summary">
    <div>
      <h2><CalendarDays aria-hidden /> Congresos del alumno</h2>
      <p>{memberships.length
        ? memberships.map((event) => event.name).join(" · ")
        : "Este alumno todavía no está asignado a ningún congreso."}</p>
      {message && <span className="save-message">{message}</span>}
    </div>
    <button className="button button-secondary" onClick={() => { setOpen(true); setError(""); }}>
      <Settings2 aria-hidden />Administrar congresos
    </button>
    <Modal open={open} title="Congresos del alumno" description="El historial con asistencias se conserva y no puede retirarse." onClose={() => !loadingId && setOpen(false)} wide>
      <div className="student-event-editor">
        <div className="student-event-list">
          {memberships.map((event) => <article className="student-event-item" key={event.id}>
            <div><span className={event.status === "active" ? "pill pill-live" : "pill"}>{statusLabel[event.status]}</span><strong>{event.name}</strong><small>{event.venue} · {event.attendanceCount} asistencias</small></div>
            <button className="icon-button event-remove" title={event.attendanceCount ? "No se puede retirar porque tiene asistencias" : "Retirar del congreso"} aria-label={`Retirar de ${event.name}`} disabled={Boolean(loadingId) || event.attendanceCount > 0} onClick={() => remove(event)}><Trash2 aria-hidden /></button>
          </article>)}
          {!memberships.length && <p className="empty-note">Sin congresos asignados.</p>}
        </div>
        {availableActiveEvents.length > 0 && <div className="available-events"><h3>Congreso activo disponible</h3>{availableActiveEvents.map((event) => <article className="student-event-item" key={event.id}><div><span className="pill pill-live">ACTIVO</span><strong>{event.name}</strong><small>{event.venue}</small></div><button className="button button-primary" disabled={Boolean(loadingId)} onClick={() => assign(event)}><Plus aria-hidden />{loadingId === event.id ? "Asignando…" : "Asignar"}</button></article>)}</div>}
        {!availableActiveEvents.length && memberships.some((event) => event.status === "active") && <p className="empty-note">El alumno ya pertenece al congreso activo.</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </div>
    </Modal>
  </section>;
}

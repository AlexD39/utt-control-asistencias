"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Modal } from "@/components/modal";

type Activity = { id: string; code: string; name: string; session_type: "workshop" | "general"; capacity: number | null; enrolled: number; assigned: boolean };

export function StudentAccessManager({ studentId, eventName, useLimit, usesConsumed, activities }: {
  studentId: string; eventName: string; useLimit: number | null; usesConsumed: number; activities: Activity[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [credentialType, setCredentialType] = useState(useLimit === null ? "reusable" : "limited");
  const [limit, setLimit] = useState(useLimit ?? Math.max(1, usesConsumed));
  const [selected, setSelected] = useState(activities.filter((activity) => activity.assigned).map((activity) => activity.id));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setLoading(true); setError("");
    const response = await fetch(`/api/students/${studentId}/access`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ credentialType, credentialUseLimit: credentialType === "limited" ? limit : null, workshopIds: selected }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar la configuración");
    setMessage("Acceso y actividades actualizados. La credencial QR existente conserva los nuevos permisos."); setEditing(false); router.refresh();
  }

  const assignedCount = activities.filter((activity) => activity.assigned).length;
  return <>
    <section className="credential-action access-summary"><div><h2>Acceso a {eventName}</h2><p>{useLimit === null ? "Credencial reutilizable" : `${usesConsumed} de ${useLimit} usos consumidos`} · {assignedCount} actividades asignadas</p>{message && <span className="save-message">{message}</span>}</div><button className="button button-secondary" onClick={() => { setEditing(true); setError(""); }}><KeyRound aria-hidden />Configurar acceso</button></section>
    <Modal open={editing} title="Credencial y actividades" description="El mismo QR funciona para el congreso, las sesiones generales y los talleres asignados." onClose={() => !loading && setEditing(false)} wide>
      <div className="access-editor"><div className="form-grid"><label>Tipo de credencial<select value={credentialType} onChange={(event) => setCredentialType(event.target.value)}><option value="reusable">Reutilizable</option><option value="limited">Usos limitados</option></select></label>{credentialType === "limited" && <label>Máximo de usos<input type="number" min={Math.max(1, usesConsumed)} max="1000" value={limit} onChange={(event) => setLimit(Number(event.target.value))} /><small>No puede ser menor a los {usesConsumed} usos ya consumidos.</small></label>}</div><fieldset className="workshop-options"><legend>Actividades asignadas</legend>{activities.length ? activities.map((activity) => { const full = activity.capacity !== null && activity.enrolled >= activity.capacity && !activity.assigned; const typeLabel = activity.session_type === "workshop" ? "Taller" : "Sesión general"; return <label className="selection-item" key={activity.id}><input type="checkbox" checked={selected.includes(activity.id)} disabled={full} onChange={() => setSelected((current) => current.includes(activity.id) ? current.filter((id) => id !== activity.id) : [...current, activity.id])} /><span><strong>{activity.name}</strong><small>{typeLabel} · {activity.code}{activity.capacity ? ` · ${activity.enrolled}/${activity.capacity}` : " · Sin límite"}{full ? " · CUPO LLENO" : ""}</small></span></label>; }) : <p>No hay talleres ni sesiones generales con inscripción disponibles.</p>}</fieldset>{error && <div className="alert alert-error" role="alert">{error}</div>}<div className="form-actions"><button className="button button-secondary" onClick={() => setEditing(false)}>Cancelar</button><button className="button button-primary" onClick={save} disabled={loading}>{loading ? "Guardando…" : "Guardar configuración"}</button></div></div>
    </Modal>
  </>;
}

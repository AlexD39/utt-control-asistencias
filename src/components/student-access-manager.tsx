"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Modal } from "@/components/modal";

type Workshop = { id: string; code: string; name: string; capacity: number | null; enrolled: number; assigned: boolean };

export function StudentAccessManager({ studentId, eventName, useLimit, usesConsumed, workshops }: {
  studentId: string; eventName: string; useLimit: number | null; usesConsumed: number; workshops: Workshop[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [credentialType, setCredentialType] = useState(useLimit === null ? "reusable" : "limited");
  const [limit, setLimit] = useState(useLimit ?? Math.max(1, usesConsumed));
  const [selected, setSelected] = useState(workshops.filter((workshop) => workshop.assigned).map((workshop) => workshop.id));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setLoading(true); setError("");
    const response = await fetch(`/api/students/${studentId}/access`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ credentialType, credentialUseLimit: credentialType === "limited" ? limit : null, workshopIds: selected }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar la configuración");
    setMessage("Acceso y talleres actualizados."); setEditing(false); router.refresh();
  }

  return <>
    <section className="credential-action access-summary"><div><h2>Acceso a {eventName}</h2><p>{useLimit === null ? "Credencial reutilizable" : `${usesConsumed} de ${useLimit} usos consumidos`} · {workshops.filter((workshop) => workshop.assigned).length} talleres asignados</p>{message && <span className="save-message">{message}</span>}</div><button className="button button-secondary" onClick={() => { setEditing(true); setError(""); }}><KeyRound aria-hidden />Configurar acceso</button></section>
    <Modal open={editing} title="Credencial y talleres" description="Los escaneos repetidos en la misma actividad no consumen otro uso." onClose={() => !loading && setEditing(false)} wide>
      <div className="access-editor"><div className="form-grid"><label>Tipo de credencial<select value={credentialType} onChange={(event) => setCredentialType(event.target.value)}><option value="reusable">Reutilizable</option><option value="limited">Usos limitados</option></select></label>{credentialType === "limited" && <label>Máximo de usos<input type="number" min={Math.max(1, usesConsumed)} max="1000" value={limit} onChange={(event) => setLimit(Number(event.target.value))} /><small>No puede ser menor a los {usesConsumed} usos ya consumidos.</small></label>}</div><fieldset className="workshop-options"><legend>Talleres asignados</legend>{workshops.length ? workshops.map((workshop) => { const full = workshop.capacity !== null && workshop.enrolled >= workshop.capacity && !workshop.assigned; return <label className="selection-item" key={workshop.id}><input type="checkbox" checked={selected.includes(workshop.id)} disabled={full} onChange={() => setSelected((current) => current.includes(workshop.id) ? current.filter((id) => id !== workshop.id) : [...current, workshop.id])} /><span><strong>{workshop.name}</strong><small>{workshop.code}{workshop.capacity ? ` · ${workshop.enrolled}/${workshop.capacity}` : " · Sin límite"}{full ? " · CUPO LLENO" : ""}</small></span></label>; }) : <p>No hay talleres activos.</p>}</fieldset>{error && <div className="alert alert-error" role="alert">{error}</div>}<div className="form-actions"><button className="button button-secondary" onClick={() => setEditing(false)}>Cancelar</button><button className="button button-primary" onClick={save} disabled={loading}>{loading ? "Guardando…" : "Guardar configuración"}</button></div></div>
    </Modal>
  </>;
}

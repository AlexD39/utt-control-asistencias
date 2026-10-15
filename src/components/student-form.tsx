"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BadgeCheck, CheckCircle2, UserPlus } from "lucide-react";
import { CredentialPreview } from "@/components/credential-preview";

type CreatedStudent = { id: string; name: string; enrollment: string; program: string; credential: string; credentialUseLimit: number | null };
type Workshop = { id: string; code: string; name: string; capacity: number | null; enrolled: number };

export function StudentForm({ eventName, workshops, onCancel }: { eventName?: string; workshops: Workshop[]; onCancel?: () => void }) {
  const [student, setStudent] = useState<CreatedStudent | null>(null);
  const [credentialType, setCredentialType] = useState("reusable");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (student) successRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [student]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"), enrollment: form.get("enrollment"), email: form.get("email"), program: form.get("program"),
        credentialType: form.get("credentialType"),
        credentialUseLimit: form.get("credentialType") === "limited" ? Number(form.get("credentialUseLimit")) : null,
        workshopIds: form.getAll("workshopIds")
      })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "No se pudo registrar al alumno");
      return;
    }
    setStudent(data.student);
  }

  if (student) return <div className="student-created-flow">
    <div ref={successRef} className="student-created-message" role="status" aria-live="polite">
      <span className="student-created-icon"><CheckCircle2 aria-hidden /></span>
      <div className="student-created-copy">
        <p className="eyebrow">REGISTRO COMPLETADO</p>
        <h2>Alumno registrado correctamente</h2>
        <p><strong>{student.name}</strong> ya cuenta con una credencial activa.</p>
        <div className="student-created-meta"><span>{student.enrollment}</span><span>{student.program}</span></div>
      </div>
    </div>
    <p className="credential-next-step">Ahora puedes imprimir el código QR o configurar el chip NFC. Conserva esta pantalla hasta terminar la credencial.</p>
    <CredentialPreview student={student} />
    <div className="after-create"><Link href={`/students/${student.id}`} className="button button-secondary">Ver expediente</Link><button className="button button-primary" onClick={() => setStudent(null)}>Registrar otro alumno</button></div>
  </div>;

  return <form className="card student-form" onSubmit={submit}>
    <div className="form-section-head"><span>01</span><div><h2>Información académica</h2><p>Estos datos se mostrarán en la validación y en la credencial.</p></div></div>
    <div className="form-grid">
      <label>Nombre completo<input name="name" placeholder="Ej. Andrea Martínez López" minLength={3} required /></label>
      <label>Matrícula<input name="enrollment" placeholder="Ej. A20260125" minLength={3} required /></label>
      <label>Correo institucional<input name="email" type="email" placeholder="alumno@universidad.edu.mx" /></label>
      <label>Programa o carrera<input name="program" placeholder="Ej. Ingeniería en Sistemas" minLength={2} required /></label>
    </div>
    <div className="form-section-head compact"><span>02</span><div><h2>Acceso y talleres</h2><p>Configura la credencial para {eventName ?? "el congreso activo"}.</p></div></div>
    <div className="form-grid credential-policy-grid">
      <label>Tipo de credencial<select name="credentialType" value={credentialType} onChange={(event) => setCredentialType(event.target.value)}><option value="reusable">Reutilizable</option><option value="limited">Usos limitados</option></select></label>
      {credentialType === "limited" && <label>Máximo de usos<input name="credentialUseLimit" type="number" min="1" max="1000" defaultValue="1" required /><small>Entre 1 y 1,000 accesos.</small></label>}
    </div>
    <fieldset className="workshop-options"><legend>Talleres asignados</legend>{workshops.length ? workshops.map((workshop) => <label className="selection-item" key={workshop.id}><input type="checkbox" name="workshopIds" value={workshop.id} disabled={workshop.capacity !== null && workshop.enrolled >= workshop.capacity} /><span><strong>{workshop.name}</strong><small>{workshop.code}{workshop.capacity ? ` · ${workshop.enrolled}/${workshop.capacity} lugares` : " · Sin límite de cupo"}</small></span></label>) : <p>No hay talleres activos disponibles.</p>}</fieldset>
    <div className="auto-credential"><span><BadgeCheck aria-hidden /></span><div><strong>Credencial automática</strong><p>Al guardar se generará un token seguro, el código QR y la vista previa lista para imprimir.</p></div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <div className="form-actions">{onCancel ? <button type="button" className="button button-secondary" onClick={onCancel}>Cancelar</button> : <Link href="/students" className="button button-secondary">Cancelar</Link>}<button className="button button-primary" disabled={loading}><UserPlus aria-hidden />{loading ? "Generando…" : "Registrar y generar credencial"}</button></div>
  </form>;
}

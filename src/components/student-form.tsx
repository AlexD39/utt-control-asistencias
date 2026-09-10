"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CredentialPreview } from "@/components/credential-preview";

type CreatedStudent = { id: string; name: string; enrollment: string; program: string; credential: string };

export function StudentForm() {
  const [student, setStudent] = useState<CreatedStudent | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "No se pudo registrar al alumno");
      return;
    }
    setStudent(data.student);
  }

  if (student) return <>
    <div className="success-banner"><span>✓</span><div><strong>Alumno y credencial creados</strong><p>Ahora puedes imprimir el QR o grabar el mismo token en su chip NFC.</p></div></div>
    <CredentialPreview student={student} />
    <div className="after-create"><Link href={`/students/${student.id}`} className="button button-secondary">Ver expediente</Link><button className="button button-primary" onClick={() => setStudent(null)}>Registrar otro alumno</button></div>
  </>;

  return <form className="card student-form" onSubmit={submit}>
    <div className="form-section-head"><span>01</span><div><h2>Información académica</h2><p>Estos datos se mostrarán en la validación y en la credencial.</p></div></div>
    <div className="form-grid">
      <label>Nombre completo<input name="name" placeholder="Ej. Andrea Martínez López" minLength={3} required /></label>
      <label>Matrícula<input name="enrollment" placeholder="Ej. A20260125" minLength={3} required /></label>
      <label>Correo institucional<input name="email" type="email" placeholder="alumno@universidad.edu.mx" /></label>
      <label>Programa o carrera<input name="program" placeholder="Ej. Ingeniería en Sistemas" minLength={2} required /></label>
    </div>
    <div className="auto-credential"><span>✦</span><div><strong>Credencial automática</strong><p>Al guardar se generará un token seguro, el código QR y la vista previa lista para imprimir.</p></div></div>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="form-actions"><Link href="/students" className="button button-secondary">Cancelar</Link><button className="button button-primary" disabled={loading}>{loading ? "Generando…" : "Registrar y generar credencial"}</button></div>
  </form>;
}

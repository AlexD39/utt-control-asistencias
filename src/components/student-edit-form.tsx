"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type EditableStudent = {
  id: string;
  name: string;
  enrollment: string;
  email: string | null;
  program: string;
  active: boolean;
};

export function StudentEditForm({ student }: { student: EditableStudent }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/students/" + student.id, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        enrollment: form.get("enrollment"),
        email: form.get("email"),
        program: form.get("program"),
        active: form.get("active") === "on"
      })
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error ?? "No fue posible guardar los cambios");
      return;
    }
    setMessage("Información actualizada correctamente.");
    setEditing(false);
    router.refresh();
  }

  if (!editing) return <div className="edit-student-bar"><div><strong>Información del alumno</strong><p>Edita matrícula, nombre, correo, programa y estado.</p></div><button className="button button-secondary" onClick={() => setEditing(true)}>Editar información</button>{message && <span className="save-message">{message}</span>}</div>;

  return <form className="card student-edit-form" onSubmit={submit}>
    <div className="card-head"><div><h2>Editar información</h2><p>Desactivar al alumno también desactiva su credencial vigente.</p></div></div>
    <div className="form-grid">
      <label>Nombre completo<input name="name" defaultValue={student.name} required /></label>
      <label>Matrícula<input name="enrollment" defaultValue={student.enrollment} required /></label>
      <label>Correo<input name="email" type="email" defaultValue={student.email ?? ""} /></label>
      <label>Programa o carrera<input name="program" defaultValue={student.program} required /></label>
    </div>
    <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={student.active} /><span>Alumno activo</span></label>
    {message && <div className="alert alert-error">{message}</div>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(false)}>Cancelar</button><button className="button button-primary" disabled={loading}>{loading ? "Guardando…" : "Guardar cambios"}</button></div>
  </form>;
}

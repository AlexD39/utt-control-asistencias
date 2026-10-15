"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/modal";

type EditableStudent = { id: string; name: string; enrollment: string; email: string | null; program: string; active: boolean };

export function StudentEditForm({ student }: { student: EditableStudent }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/students/" + student.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), enrollment: form.get("enrollment"), email: form.get("email"), program: form.get("program"), active: form.get("active") === "on" }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar los cambios");
    setMessage("Información actualizada correctamente."); setEditing(false); router.refresh();
  }

  return <>
    <div className="edit-student-bar"><div><strong>Información del alumno</strong><p>Edita matrícula, nombre, correo, programa y estado.</p></div><button className="button button-secondary" onClick={() => { setEditing(true); setError(""); }}><Pencil aria-hidden />Editar información</button>{message && <span className="save-message">{message}</span>}</div>
    <Modal open={editing} title="Editar información" description="Desactivar al alumno también desactiva su credencial vigente." onClose={() => !loading && setEditing(false)} wide>
      <form className="entity-form student-edit-form" onSubmit={submit}><div className="form-grid"><label>Nombre completo<input name="name" defaultValue={student.name} autoFocus required /></label><label>Matrícula<input name="enrollment" defaultValue={student.enrollment} required /></label><label>Correo<input name="email" type="email" defaultValue={student.email ?? ""} /></label><label>Programa o carrera<input name="program" defaultValue={student.program} required /></label></div><label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={student.active} /><span>Alumno activo</span></label>{error && <div className="alert alert-error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(false)}>Cancelar</button><button className="button button-primary" disabled={loading}>{loading ? "Guardando…" : "Guardar cambios"}</button></div></form>
    </Modal>
  </>;
}

"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Upload } from "lucide-react";

type ImportResult = { total: number; created: number; updated: number; workshopAssignments: number; credentialsCreated: number; queuedEmails: number };
type Activity = { id: string; code: string; name: string; session_type: "workshop" | "general"; capacity: number | null; enrolled: number };

export function StudentImport({ eventId, eventName, activities, returnToEvent = false }: { eventId?: string; eventName?: string; activities: Activity[]; returnToEvent?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [sharedActivityIds, setSharedActivityIds] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    if (file.size > 5_000_000) {
      setError("El archivo supera el límite de 5 MB");
      return;
    }
    setLoading(true);
    setError("");
    setDetails([]);
    const payload = new FormData();
    payload.append("file", file);
    if (eventId) payload.append("eventId", eventId);
    sharedActivityIds.forEach((activityId) => payload.append("sharedWorkshopIds", activityId));
    if (new FormData(event.currentTarget).get("queueEmails") === "on") payload.append("queueEmails", "true");
    const response = await fetch("/api/students/import", { method: "POST", body: payload });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "No fue posible importar el archivo");
      setDetails(data.details ?? []);
      return;
    }
    setResult(data);
  }

  if (result) return <section className="card import-complete">
    <span className="import-check"><CheckCircle2 aria-hidden /></span><div><h2>Importación terminada</h2><p>Se procesaron {result.total} alumnos. Una sola credencial sirve para el congreso y todas sus actividades asignadas.</p></div>
    <div className="import-metrics"><div><strong>{result.created}</strong><span>Nuevos</span></div><div><strong>{result.updated}</strong><span>Actualizados</span></div><div><strong>{result.workshopAssignments}</strong><span>Inscripciones</span></div><div><strong>{result.credentialsCreated}</strong><span>Credenciales</span></div><div><strong>{result.queuedEmails}</strong><span>Correos listos</span></div></div>
    <div className="heading-actions"><Link href={returnToEvent && eventId ? "/events/" + eventId : "/students"} className="button button-primary">{returnToEvent ? "Volver al congreso" : "Ver alumnos"}</Link><button className="button button-secondary" onClick={() => { setResult(null); setFile(null); }}>Importar otro archivo</button></div>
  </section>;

  return <form className="card import-card" onSubmit={submit}>
    <div className="form-section-head"><span><FileSpreadsheet aria-hidden /></span><div><h2>Importar desde Excel o CSV</h2><p>Los alumnos existentes se actualizarán por matrícula y todos se asignarán a {eventName ?? "el congreso activo"}. Primero se valida el archivo completo; si existe un error, no se guarda ninguna fila.</p></div></div>
    <div className="import-instructions" aria-label="Instrucciones para importar alumnos">
      <h3>Cómo preparar el archivo</h3>
      <ol>
        <li><strong>Descarga la plantilla</strong> y ábrela con Excel, Google Sheets o LibreOffice.</li>
        <li><strong>No cambies los encabezados.</strong> Matrícula, Nombre y Programa son obligatorios.</li>
        <li>Escribe <strong>un alumno por fila</strong>. En Talleres o Actividades puedes usar claves o nombres separados por <code>|</code>.</li>
        <li>Guarda como <strong>Libro de Excel (.xlsx)</strong> o <strong>CSV UTF-8 (.csv)</strong> y selecciónalo aquí.</li>
      </ol>
      <p><strong>Importante:</strong> configura la columna Matrícula como texto en Excel para conservar ceros iniciales.</p>
    </div>
    <label className="file-drop">
      <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); setDetails([]); }} />
      <span><FileUp aria-hidden /></span><strong>{file?.name ?? "Seleccionar archivo de Excel o CSV"}</strong><small>Formatos .xlsx y .csv · máximo 5,000 alumnos o 5 MB</small>
    </label>
    <fieldset className="workshop-options import-workshops"><legend>Actividades para todos los alumnos del archivo</legend>
      <p className="list-note">Opcional. Incluye talleres y sesiones generales con inscripción previa. Se sumarán a las actividades indicadas dentro del Excel.</p>
      {activities.length ? activities.map((activity) => {
        const full = activity.capacity !== null && activity.enrolled >= activity.capacity;
        const typeLabel = activity.session_type === "workshop" ? "Taller" : "Sesión general";
        return <label className="selection-item" key={activity.id}><input type="checkbox" checked={sharedActivityIds.includes(activity.id)} disabled={full} onChange={() => setSharedActivityIds((current) => current.includes(activity.id) ? current.filter((id) => id !== activity.id) : [...current, activity.id])} /><span><strong>{activity.name}</strong><small>{typeLabel} · {activity.code}{activity.capacity ? ` · ${activity.enrolled}/${activity.capacity} lugares` : " · Sin límite de cupo"}{full ? " · CUPO LLENO" : ""}</small></span></label>;
      }) : <p>No hay talleres ni sesiones generales con inscripción disponibles.</p>}
      <small className="list-note">Seleccionadas para todos: {sharedActivityIds.length}. Cada alumno puede tener múltiples actividades.</small>
    </fieldset>
    <label className="checkbox-field import-email-option"><input name="queueEmails" type="checkbox" /><span><strong>Preparar correos de credencial al terminar</strong><small>Se generará una credencial para quien no tenga una. Cada alumno tendrá un solo QR válido para el congreso y sus actividades.</small></span></label>
    <div className="csv-columns"><strong>Columnas aceptadas</strong><span>Matrícula *</span><span>Nombre *</span><span>Programa *</span><span>Correo</span><span>Talleres o Actividades</span><span>TipoCredencial</span><span>Usos</span></div>
    <p className="csv-help">En <strong>TipoCredencial</strong> usa <code>reutilizable</code> o <code>limitada</code>. Si eliges limitada, escribe entre 1 y 1,000 en <strong>Usos</strong>. En Talleres o Actividades puedes escribir la clave o el nombre exacto.</p>
    <a href="/plantilla-alumnos.csv" download className="template-link"><Download aria-hidden />Descargar plantilla compatible con Excel</a>
    {!eventId && <div className="alert alert-error"><strong>No hay un congreso disponible.</strong><div>Crea o activa un congreso antes de importar alumnos.</div></div>}
    {error && <div className="alert alert-error"><strong>{error}</strong>{details.map((detail) => <div key={detail}>{detail}</div>)}</div>}
    <div className="form-actions"><Link href={returnToEvent && eventId ? "/events/" + eventId : "/students"} className="button button-secondary">Cancelar</Link><button className="button button-primary" disabled={!file || loading || !eventId}><Upload aria-hidden />{loading ? "Validando e importando…" : "Validar e importar alumnos"}</button></div>
  </form>;
}

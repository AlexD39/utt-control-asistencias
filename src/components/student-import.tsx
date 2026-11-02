"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Upload } from "lucide-react";

type ImportResult = { total: number; created: number; updated: number; workshopAssignments: number };

export function StudentImport({ eventId, eventName }: { eventId?: string; eventName?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
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
    const response = await fetch("/api/students/import", {
      method: "POST",
      body: payload
    });
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
    <span className="import-check"><CheckCircle2 aria-hidden /></span><h2>Importación terminada</h2><p>Se procesaron {result.total} alumnos correctamente.</p>
    <div className="import-metrics"><div><strong>{result.created}</strong><span>Nuevos</span></div><div><strong>{result.updated}</strong><span>Actualizados</span></div><div><strong>{result.workshopAssignments}</strong><span>Inscripciones nuevas</span></div></div>
    <div className="heading-actions"><Link href={eventId ? "/events/" + eventId : "/students"} className="button button-primary">{eventId ? "Volver al congreso" : "Ver alumnos"}</Link><button className="button button-secondary" onClick={() => { setResult(null); setFile(null); }}>Importar otro archivo</button></div>
  </section>;

  return <form className="card import-card" onSubmit={submit}>
    <div className="form-section-head"><span><FileSpreadsheet aria-hidden /></span><div><h2>Importar desde Excel o CSV</h2><p>Los alumnos existentes se actualizarán por matrícula y todos se asignarán a {eventName ?? "el congreso activo"}. Primero se valida el archivo completo; si existe un error, no se guarda ninguna fila.</p></div></div>
    <div className="import-instructions" aria-label="Instrucciones para importar alumnos">
      <h3>Cómo preparar el archivo</h3>
      <ol>
        <li><strong>Descarga la plantilla</strong> y ábrela con Excel, Google Sheets o LibreOffice.</li>
        <li><strong>No cambies los encabezados.</strong> Matrícula, Nombre y Programa son obligatorios.</li>
        <li>Escribe <strong>un alumno por fila</strong>. Para varios talleres utiliza sus claves separadas por <code>|</code>.</li>
        <li>Guarda como <strong>Libro de Excel (.xlsx)</strong> o <strong>CSV UTF-8 (.csv)</strong> y selecciónalo aquí.</li>
      </ol>
      <p><strong>Importante:</strong> configura la columna Matrícula como texto en Excel para conservar ceros iniciales.</p>
    </div>
    <label className="file-drop">
      <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); setDetails([]); }} />
      <span><FileUp aria-hidden /></span><strong>{file?.name ?? "Seleccionar archivo de Excel o CSV"}</strong><small>Formatos .xlsx y .csv · máximo 5,000 alumnos o 5 MB</small>
    </label>
    <div className="csv-columns"><strong>Columnas aceptadas</strong><span>Matrícula *</span><span>Nombre *</span><span>Programa *</span><span>Correo</span><span>Talleres</span><span>TipoCredencial</span><span>Usos</span></div>
    <p className="csv-help">En <strong>TipoCredencial</strong> usa <code>reutilizable</code> o <code>limitada</code>. Si eliges limitada, escribe entre 1 y 1,000 en <strong>Usos</strong>. Las claves de Talleres deben existir en el congreso.</p>
    <a href="/plantilla-alumnos.csv" download className="template-link"><Download aria-hidden />Descargar plantilla compatible con Excel</a>
    {error && <div className="alert alert-error"><strong>{error}</strong>{details.map((detail) => <div key={detail}>{detail}</div>)}</div>}
    <div className="form-actions"><Link href={eventId ? "/events/" + eventId : "/students"} className="button button-secondary">Cancelar</Link><button className="button button-primary" disabled={!file || loading}><Upload aria-hidden />{loading ? "Validando e importando…" : "Validar e importar alumnos"}</button></div>
  </form>;
}

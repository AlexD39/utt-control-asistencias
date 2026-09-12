"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type ImportResult = { total: number; created: number; updated: number };

export function StudentImport({ eventId, eventName }: { eventId?: string; eventName?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setDetails([]);
    const response = await fetch("/api/students/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: await file.text(), eventId })
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
    <span className="import-check">✓</span><h2>Importación terminada</h2><p>Se procesaron {result.total} alumnos correctamente.</p>
    <div className="import-metrics"><div><strong>{result.created}</strong><span>Nuevos</span></div><div><strong>{result.updated}</strong><span>Actualizados</span></div></div>
    <div className="heading-actions"><Link href={eventId ? "/events/" + eventId : "/students"} className="button button-primary">{eventId ? "Volver al congreso" : "Ver alumnos"}</Link><button className="button button-secondary" onClick={() => { setResult(null); setFile(null); }}>Importar otro archivo</button></div>
  </section>;

  return <form className="card import-card" onSubmit={submit}>
    <div className="form-section-head"><span>CSV</span><div><h2>Selecciona el archivo</h2><p>Los alumnos existentes se actualizarán usando su matrícula y se asignarán a {eventName ?? "el congreso activo"}. Los nuevos quedarán listos para generar su credencial.</p></div></div>
    <label className="file-drop">
      <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <span>↑</span><strong>{file?.name ?? "Seleccionar archivo CSV"}</strong><small>Máximo 5,000 alumnos o 2 MB</small>
    </label>
    <div className="csv-columns"><strong>Columnas requeridas</strong><span>Matrícula</span><span>Nombre</span><span>Programa</span><span>Correo (opcional)</span></div>
    <a href="/plantilla-alumnos.csv" download className="template-link">↓ Descargar plantilla de ejemplo</a>
    {error && <div className="alert alert-error"><strong>{error}</strong>{details.map((detail) => <div key={detail}>{detail}</div>)}</div>}
    <div className="form-actions"><Link href={eventId ? "/events/" + eventId : "/students"} className="button button-secondary">Cancelar</Link><button className="button button-primary" disabled={!file || loading}>{loading ? "Importando…" : "Importar alumnos"}</button></div>
  </form>;
}

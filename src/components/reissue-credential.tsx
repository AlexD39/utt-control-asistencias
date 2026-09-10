"use client";

import { useState } from "react";
import { CredentialPreview } from "@/components/credential-preview";

type Student = { id: string; name: string; enrollment: string; program: string };

export function ReissueCredential({ student }: { student: Student }) {
  const [credential, setCredential] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function reissue() {
    if (!window.confirm("La credencial anterior dejará de funcionar. ¿Deseas continuar?")) return;
    setLoading(true);
    setError("");
    const response = await fetch(`/api/students/${student.id}/credential`, { method: "POST" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error ?? "No se pudo emitir la credencial");
    setCredential(data.student.credential);
  }

  if (credential) return <div className="reissue-result"><div className="success-banner"><span>✓</span><div><strong>Nueva credencial activa</strong><p>El QR y el chip anterior han quedado invalidados.</p></div></div><CredentialPreview student={{ ...student, credential }} /></div>;
  return <div className="credential-action"><div><h2>Credencial QR / NFC</h2><p>Por seguridad no conservamos el token visible. Puedes emitir uno nuevo para imprimirlo o grabarlo en otro chip.</p>{error && <div className="alert alert-error">{error}</div>}</div><button className="button button-primary" onClick={reissue} disabled={loading}>{loading ? "Generando…" : "Generar nueva credencial"}</button></div>;
}

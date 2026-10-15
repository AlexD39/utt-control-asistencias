"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Send } from "lucide-react";

type Status = {
  event: { id: string; name: string };
  availability: { total: number; eligible: number; missing_email: number; missing_token: number };
  statuses: Record<string, number>;
  provider: "resend";
  providerConfigured: boolean;
  recent: { id: string; recipient: string; status: string; attempts: number; last_error: string | null; student_name: string }[];
};

export function CredentialEmailManager() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/credential-emails", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setStatus(result); else setError(result.error ?? "No fue posible consultar los envíos");
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function queue(action = "queue") {
    setLoading(true); setError(""); setMessage("");
    const response = await fetch("/api/credential-emails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error ?? "No fue posible preparar los correos");
    setMessage(`${result.queued} correo${result.queued === 1 ? "" : "s"} preparado${result.queued === 1 ? "" : "s"}.`); await refresh();
  }

  async function processQueue() {
    setLoading(true); setError(""); setMessage("Enviando correos…");
    let sent = 0;
    for (let index = 0; index < 500; index += 1) {
      const response = await fetch("/api/credential-emails/process", { method: "POST" });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "El proveedor rechazó un envío; quedará listo para reintentar."); break; }
      if (!result.processed) break;
      if (result.status === "sent") sent += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    }
    setLoading(false); setMessage(`${sent} correo${sent === 1 ? "" : "s"} enviado${sent === 1 ? "" : "s"}.`); await refresh();
  }

  if (!status) return <section className="card email-manager"><p>Cargando estado de correos…</p>{error && <div className="alert alert-error">{error}</div>}</section>;
  const pending = status.statuses.queued ?? 0;
  const failed = status.statuses.failed ?? 0;
  return <section className="card email-manager">
    <div className="card-head"><div><p className="eyebrow">CREDENCIALES POR CORREO</p><h2>Envío masivo</h2><p>{status.event.name} · Resend {status.providerConfigured ? "configurado" : "pendiente de configurar"}</p></div><Mail aria-hidden /></div>
    <div className="email-metrics"><span><strong>{status.availability.eligible}</strong> listas</span><span><strong>{pending}</strong> pendientes</span><span><strong>{status.statuses.sent ?? 0}</strong> enviadas</span><span><strong>{failed}</strong> fallidas</span></div>
    {(status.availability.missing_email > 0 || status.availability.missing_token > 0) && <div className="email-warning"><AlertTriangle aria-hidden /><p>{status.availability.missing_email > 0 ? `${status.availability.missing_email} sin correo. ` : ""}{status.availability.missing_token > 0 ? `${status.availability.missing_token} credenciales antiguas necesitan reemitirse para poder enviarse.` : ""}</p></div>}
    {!status.providerConfigured && <p className="helper">La cola está lista. En el VPS agrega RESEND_API_KEY, EMAIL_FROM, EMAIL_WORKER_KEY y CREDENTIAL_ENCRYPTION_KEY.</p>}
    {error && <div className="alert alert-error" role="alert">{error}</div>}{message && <div className="success-banner"><CheckCircle2 aria-hidden /><strong>{message}</strong></div>}
    <div className="form-actions"><button className="button button-secondary" disabled={loading || status.availability.eligible === 0} onClick={() => queue()}><Mail aria-hidden />Preparar envíos</button>{failed > 0 && <button className="button button-secondary" disabled={loading} onClick={() => queue("retry")}><RefreshCw aria-hidden />Reintentar fallidos</button>}<button className="button button-primary" disabled={loading || !status.providerConfigured || pending === 0} onClick={processQueue}><Send aria-hidden />{loading ? "Procesando…" : "Enviar pendientes"}</button></div>
  </section>;
}

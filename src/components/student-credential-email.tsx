"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, RefreshCw, Send } from "lucide-react";

export type StudentEmailDelivery = {
  status: "queued" | "sending" | "sent" | "failed";
  recipient: string;
  sentAt: string | null;
  lastError?: string | null;
};

export function StudentCredentialEmail({
  studentId,
  email,
  providerConfigured,
  initialDelivery = null,
}: {
  studentId: string;
  email: string | null;
  providerConfigured: boolean;
  initialDelivery?: StudentEmailDelivery | null;
}) {
  const router = useRouter();
  const [delivery, setDelivery] = useState(initialDelivery);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialDelivery?.lastError ?? "");

  async function send() {
    const resend = delivery?.status === "sent";
    if (resend && !window.confirm(`La credencial ya fue enviada a ${delivery.recipient}. ¿Deseas reenviarla?`)) return;
    setLoading(true);
    setMessage("");
    setError("");

    const queuedResponse = await fetch(`/api/students/${studentId}/credential-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resend }),
    });
    const queued = await queuedResponse.json();
    if (!queuedResponse.ok) {
      setLoading(false);
      setError(queued.error ?? "No se pudo preparar el correo");
      return;
    }
    setDelivery(queued.delivery);
    if (!queued.process) {
      setLoading(false);
      setMessage("La credencial ya se encontraba enviada.");
      return;
    }

    const processResponse = await fetch("/api/credential-emails/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deliveryId: queued.delivery.id }),
    });
    const processed = await processResponse.json();
    setLoading(false);
    if (!processResponse.ok) {
      setDelivery({
        ...queued.delivery,
        status: processed.status === "queued" ? "queued" : "failed",
        lastError: processed.error ?? null,
      });
      setError(processed.error ?? "Resend rechazó el envío; puedes reintentarlo después.");
      router.refresh();
      return;
    }
    if (!processed.processed) {
      setMessage("La entrega quedó preparada y será procesada en breve.");
      router.refresh();
      return;
    }
    setDelivery({ ...queued.delivery, status: "sent", sentAt: new Date().toISOString(), lastError: null });
    setMessage("");
    router.refresh();
  }

  const sent = delivery?.status === "sent";
  const buttonLabel = loading ? "Enviando…" : sent ? "Reenviar credencial" : delivery?.status === "failed" ? "Reintentar envío" : "Enviar credencial";

  return <section className="credential-action individual-email">
    <div>
      <h2><Mail aria-hidden /> Credencial por correo</h2>
      {!email && <p>Agrega un correo al alumno para poder enviarle su credencial.</p>}
      {email && <p>Envía el QR individualmente a <strong>{email}</strong>. También podrás hacerlo después desde este expediente.</p>}
      {!providerConfigured && <div className="alert alert-error">Resend todavía no está configurado en el servidor.</div>}
      {sent && <div className="success-banner"><CheckCircle2 aria-hidden /><div><strong>Credencial enviada</strong><p>{delivery.recipient}{delivery.sentAt ? ` · ${new Date(delivery.sentAt).toLocaleString("es-MX")}` : ""}</p></div></div>}
      {message && <div className="success-banner"><CheckCircle2 aria-hidden /><strong>{message}</strong></div>}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
    <button className={sent ? "button button-secondary" : "button button-primary"} onClick={send} disabled={loading || !email || !providerConfigured}>
      {sent || delivery?.status === "failed" ? <RefreshCw aria-hidden /> : <Send aria-hidden />}{buttonLabel}
    </button>
  </section>;
}

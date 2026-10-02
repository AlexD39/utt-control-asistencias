"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { InstitutionBrand } from "@/components/institution-brand";
import { getNdefReader, nfcErrorMessage, nfcPayload, readCredentialFromNdef } from "@/lib/web-nfc";

type CredentialStudent = { id: string; name: string; enrollment: string; program: string; credential: string };

export function CredentialPreview({ student }: { student: CredentialStudent }) {
  const [qr, setQr] = useState("");
  const [nfcMessage, setNfcMessage] = useState("");
  const [nfcStatus, setNfcStatus] = useState<"idle" | "waiting" | "success" | "error">("idle");
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcBusy, setNfcBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(student.credential, { width: 420, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b2e4f", light: "#ffffff" } }).then(setQr);
    setNfcSupported(Boolean(getNdefReader()) && window.isSecureContext);
  }, [student.credential]);

  async function saveNfcStatus(status: "written" | "verified") {
    const response = await fetch("/api/students/" + student.id + "/credential/nfc", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) throw new Error("SYNC_ERROR");
  }

  async function writeNfc() {
    setNfcMessage("");
    setNfcStatus("idle");
    const NDEFReaderClass = getNdefReader();
    if (!NDEFReaderClass) {
      setNfcStatus("error");
      setNfcMessage("Web NFC no está disponible. Usa Chrome en Android o conserva el QR como respaldo.");
      return;
    }
    if (!window.isSecureContext) {
      setNfcStatus("error");
      setNfcMessage("Para utilizar NFC debes abrir el sistema mediante HTTPS.");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const writer = new NDEFReaderClass();
      setNfcBusy(true);
      setNfcStatus("waiting");
      setNfcMessage("Acerca el chip NFC al teléfono…");
      await writer.write({ records: [{ recordType: "text", data: nfcPayload(student.credential) }] }, { signal: controller.signal });
      await saveNfcStatus("written");
      setNfcStatus("success");
      setNfcMessage("Chip escrito correctamente. Ahora usa Verificar chip.");
    } catch (error) {
      setNfcStatus("error");
      setNfcMessage(error instanceof Error && error.message === "SYNC_ERROR" ? "El chip se escribió, pero no fue posible guardar el estado. Verifícalo nuevamente." : nfcErrorMessage(error));
    } finally {
      window.clearTimeout(timeout);
      setNfcBusy(false);
    }
  }

  async function verifyNfc() {
    const NDEFReaderClass = getNdefReader();
    if (!NDEFReaderClass || !window.isSecureContext) {
      setNfcStatus("error");
      setNfcMessage("La verificación NFC requiere Chrome en Android y HTTPS.");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      setNfcBusy(true);
      setNfcStatus("waiting");
      setNfcMessage("Acerca nuevamente el chip para comprobarlo…");
      const reader = new NDEFReaderClass();
      const reading = new Promise<string>((resolve, reject) => {
        reader.onreading = (event) => {
          const credential = readCredentialFromNdef(event);
          if (credential) resolve(credential); else reject(new Error("EMPTY_TAG"));
        };
        reader.onreadingerror = () => reject(new DOMException("No se pudo leer", "NotReadableError"));
        controller.signal.addEventListener("abort", () => reject(new DOMException("Tiempo agotado", "AbortError")), { once: true });
      });
      await reader.scan({ signal: controller.signal });
      const credential = await reading;
      controller.abort();
      if (credential !== student.credential) throw new Error("MISMATCH");
      await saveNfcStatus("verified");
      setNfcStatus("success");
      setNfcMessage("Chip verificado: corresponde a esta credencial.");
    } catch (error) {
      setNfcStatus("error");
      setNfcMessage(error instanceof Error && error.message === "MISMATCH" ? "El chip contiene otra credencial. Vuelve a configurarlo." : error instanceof Error && error.message === "EMPTY_TAG" ? "El chip no contiene una credencial UTT legible." : nfcErrorMessage(error));
    } finally {
      window.clearTimeout(timeout);
      setNfcBusy(false);
    }
  }

  return <div className="credential-workspace">
    <div className="credential-print" id="credential-print">
      <div className="credential-accent" />
      <div className="credential-brand">
        <InstitutionBrand compact />
        <span className="credential-system-name">Control de asistencias</span>
        <small>CREDENCIAL DE CONGRESO 2026</small>
      </div>
      <div className="credential-photo">{student.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</div>
      <h2>{student.name}</h2>
      <p>{student.program}</p>
      <strong className="credential-enrollment">{student.enrollment}</strong>
      {qr && <img className="credential-qr" src={qr} alt={`QR de ${student.name}`} />}
      <code className="credential-code">{student.credential}</code>
      <small className="credential-help">Presenta este código en cada acceso</small>
    </div>
    <div className="credential-actions">
      <button className="button button-primary" onClick={() => window.print()}>Imprimir credencial</button>
      <button className="button button-secondary" onClick={writeNfc} disabled={nfcBusy}>Configurar chip NFC</button>
      <button className="button button-secondary" onClick={verifyNfc} disabled={nfcBusy}>Verificar chip</button>
      <button className="button button-secondary" onClick={async () => { await navigator.clipboard.writeText(student.credential); setCopied(true); }}>{copied ? "Token copiado ✓" : "Copiar token"}</button>
      <div className={nfcSupported ? "nfc-support supported" : "nfc-support"}><span>{nfcSupported ? "✓" : "!"}</span><div><strong>{nfcSupported ? "NFC disponible" : "NFC no disponible en este dispositivo"}</strong><small>{nfcSupported ? "Mantén esta pantalla visible y acerca una etiqueta NDEF." : "Necesitas Chrome en Android, NFC encendido y una conexión HTTPS."}</small></div></div>
      {nfcMessage && <p className={"nfc-message " + nfcStatus}>{nfcMessage}</p>}
      <div className="security-note"><strong>Importante</strong><p>Este token solamente se muestra al generarlo. Si se pierde, emite una nueva credencial; la anterior dejará de funcionar.</p></div>
    </div>
  </div>;
}

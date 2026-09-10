"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { InstitutionBrand } from "@/components/institution-brand";

type CredentialStudent = { id: string; name: string; enrollment: string; program: string; credential: string };

export function CredentialPreview({ student }: { student: CredentialStudent }) {
  const [qr, setQr] = useState("");
  const [nfcMessage, setNfcMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(student.credential, { width: 420, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b2e4f", light: "#ffffff" } }).then(setQr);
  }, [student.credential]);

  async function writeNfc() {
    setNfcMessage("");
    const NDEFReaderClass = (window as unknown as { NDEFReader?: new () => { write: (message: { records: Array<{ recordType: string; data: string }> }) => Promise<void> } }).NDEFReader;
    if (!NDEFReaderClass) {
      setNfcMessage("Web NFC no está disponible aquí. Usa Chrome en Android con HTTPS o la futura app móvil.");
      return;
    }
    try {
      const writer = new NDEFReaderClass();
      setNfcMessage("Acerca el chip NFC al teléfono…");
      await writer.write({ records: [{ recordType: "text", data: student.credential }] });
      setNfcMessage("Chip NFC configurado correctamente.");
    } catch {
      setNfcMessage("No se pudo escribir el chip. Verifica permisos, NFC y que la etiqueta no esté bloqueada.");
    }
  }

  return <div className="credential-workspace">
    <div className="credential-print" id="credential-print">
      <div className="credential-accent" />
      <div className="credential-brand"><InstitutionBrand /><small>CREDENCIAL DE CONGRESO 2026</small></div>
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
           <button className="button button-secondary" onClick={writeNfc}>Configurar chip NFC</button>
      <button className="button button-secondary" onClick={async () => { await navigator.clipboard.writeText(student.credential); setCopied(true); }}>{copied ? "Token copiado ✓" : "Copiar token"}</button>
      {nfcMessage && <p className="nfc-message">{nfcMessage}</p>}
      <div className="security-note"><strong>Importante</strong><p>Este token solamente se muestra al generarlo. Si se pierde, emite una nueva credencial; la anterior dejará de funcionar.</p></div>
    </div>
  </div>;
}

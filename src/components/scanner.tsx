"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleX, Nfc, ScanLine } from "lucide-react";
import { getNdefReader, nfcErrorMessage, readCredentialFromNdef } from "@/lib/web-nfc";

type Session = { id: string; name: string; room: string; starts_at: string };
type ScanResponse = { result: string; message: string; student?: { name: string; enrollment: string; program: string }; session?: string };

export function Scanner() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [code, setCode] = useState("");
  const [demoCodes, setDemoCodes] = useState<string[]>([]);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [camera, setCamera] = useState(false);
  const [nfcListening, setNfcListening] = useState(false);
  const [nfcMessage, setNfcMessage] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const nfcControllerRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/sessions").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No fue posible consultar las sesiones.");
        return data;
      }),
      fetch("/api/demo-badges").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No fue posible consultar las credenciales.");
        return data;
      })
    ]).then(([sessionData, demoData]) => {
      setSessions(sessionData.sessions ?? []);
      setDemoCodes(demoData.codes ?? []);
      if (sessionData.sessions?.[0]) setSessionId(sessionData.sessions[0].id);
      if (!sessionData.sessions?.length) {
        setSessionError("Tu cuenta no tiene sesiones disponibles. Pide a Superadministración que te asigne al congreso activo.");
      }
    }).catch((error) => {
      setSessionError(error instanceof Error ? error.message : "No fue posible preparar el punto de registro.");
    }).finally(() => setLoadingSessions(false));
    return () => { stopCamera(); stopNfc(); };
  }, []);

  useEffect(() => {
    if (result && window.matchMedia("(max-width: 640px)").matches) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  async function register(badgeCode: string, source: "qr" | "nfc" | "manual" = "manual") {
    if (!sessionId || !badgeCode.trim() || processingRef.current) return;
    processingRef.current = true;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ badgeCode: badgeCode.trim(), sessionId, source, deviceTime: new Date().toISOString() })
      });
      const data = await response.json();
      setResult(data);
      if (navigator.vibrate) navigator.vibrate(data.result === "accepted" ? 100 : [100, 70, 100]);
    } catch {
      setResult({ result: "error", message: "No fue posible comunicarse con el servidor." });
    } finally {
      setLoading(false);
      processingRef.current = false;
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await register(code);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    scanningRef.current = false;
    setCamera(false);
  }

  function stopNfc() {
    nfcControllerRef.current?.abort();
    nfcControllerRef.current = null;
    setNfcListening(false);
    setNfcMessage("");
  }

  async function startNfc() {
    setResult(null);
    const NDEFReaderClass = getNdefReader();
    if (!NDEFReaderClass) {
      setResult({ result: "error", message: "Web NFC no está disponible. Usa Chrome en Android o escanea el QR." });
      return;
    }
    if (!window.isSecureContext) {
      setResult({ result: "error", message: "La lectura NFC requiere abrir el sistema mediante HTTPS." });
      return;
    }
    if (!sessionId) {
      setResult({ result: "error", message: "No existe una sesión activa disponible." });
      return;
    }
    stopCamera();
    stopNfc();
    const controller = new AbortController();
    nfcControllerRef.current = controller;
    try {
      const reader = new NDEFReaderClass();
      reader.onreading = (event) => {
        const credential = readCredentialFromNdef(event);
        if (!credential) {
          setResult({ result: "error", message: "El chip no contiene una credencial UTT legible." });
          return;
        }
        setCode(credential);
        void register(credential, "nfc");
      };
      reader.onreadingerror = () => setResult({ result: "error", message: "No fue posible leer el chip. Intenta acercarlo nuevamente." });
      await reader.scan({ signal: controller.signal });
      setNfcListening(true);
      setNfcMessage("Lector activo. Acerca un gafete NFC al teléfono.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setResult({ result: "error", message: nfcErrorMessage(error) });
      stopNfc();
    }
  }

  async function startCamera() {
    setResult(null);
    stopNfc();
    if (!sessionId) {
      setResult({ result: "error", message: "Selecciona una sesión antes de activar la cámara." });
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setResult({ result: "error", message: "La cámara requiere abrir el sistema mediante HTTPS o http://localhost:3000." });
      return;
    }
    const BarcodeDetectorClass = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (!BarcodeDetectorClass) {
      setResult({ result: "error", message: "Este navegador no incluye lector QR. Usa Chrome/Edge actualizado o captura el código manualmente." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCamera(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      scanningRef.current = true;
      const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
      const detect = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        const codes = await detector.detect(videoRef.current).catch(() => []);
        if (codes[0]?.rawValue) {
          setCode(codes[0].rawValue);
          stopCamera();
          await register(codes[0].rawValue, "qr");
          return;
        }
        requestAnimationFrame(detect);
      };
      requestAnimationFrame(detect);
    } catch {
      setResult({ result: "error", message: "No fue posible acceder a la cámara. Revisa el permiso del navegador." });
    }
  }

  async function scanNext() {
    setResult(null);
    setCode("");
    await startCamera();
  }

  const resultClass = result?.result === "accepted" ? "success" : result?.result === "duplicate" ? "warning" : "error";
  const resultTitle = result?.result === "accepted"
    ? "Registro confirmado"
    : result?.result === "duplicate"
      ? "Asistencia ya registrada"
      : result?.message;
  const resultHelp = result?.result === "accepted"
    ? "La asistencia se guardó correctamente. Puedes continuar con el siguiente alumno."
    : result?.result === "duplicate"
      ? "No se creó un registro adicional para esta sesión."
      : "Revisa el código e inténtalo nuevamente.";

  return <div className="scanner-layout">
    <section className="card scanner-card">
      <div className="card-head scanner-head"><div><h2>Punto de registro</h2><p>Elige la sesión y acerca la credencial a la cámara.</p></div><span className="pill pill-live">LISTO</span></div>
      <label>Sesión activa<select value={sessionId} onChange={(event) => setSessionId(event.target.value)} disabled={nfcListening || loadingSessions}>{sessions.length === 0 && <option value="">{loadingSessions ? "Consultando sesiones…" : "No hay sesiones disponibles"}</option>}{sessions.map((session) => <option key={session.id} value={session.id}>{session.name} · {session.room}</option>)}</select></label>
      {sessionError && <div className="alert alert-error" role="alert">{sessionError}</div>}
      {camera ? <div className="camera-box"><video ref={videoRef} muted playsInline /><div className="camera-frame"><span>Coloca el QR dentro del recuadro</span></div><button onClick={stopCamera} className="button button-ghost">Cancelar cámara</button></div> : <button className="camera-trigger" onClick={startCamera} disabled={!sessionId || loading}><span><ScanLine aria-hidden /></span><strong>Escanear código QR</strong><small>Abre la cámara posterior</small></button>}
      <div className="scan-methods"><button className={nfcListening ? "button button-primary" : "button button-secondary"} onClick={nfcListening ? stopNfc : startNfc} disabled={!sessionId}><Nfc aria-hidden />{nfcListening ? "Detener lector NFC" : "Usar chip NFC"}</button><span>{nfcMessage || "Opción disponible en teléfonos Android compatibles con NFC."}</span></div>
      <div className="divider"><span>o captura un código de prueba</span></div>
      <form onSubmit={submit} className="manual-form"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código del gafete" autoComplete="off" /><button className="button button-primary" disabled={loading || !sessionId}>{loading ? "Validando…" : "Registrar"}</button></form>
      <div className="demo-codes">{demoCodes.length > 0 ? demoCodes.map((demo) => <button type="button" key={demo} onClick={() => setCode(demo)}>{demo}</button>) : <small>No hay códigos demo vigentes.</small>}</div>
    </section>
    <section ref={resultRef} className={`scan-result ${result ? resultClass : "idle"}`} aria-live="polite">
      {!result ? <><span className="result-icon"><ScanLine aria-hidden /></span><h2>Listo para escanear</h2><p>Selecciona una sesión y usa la cámara para comenzar.</p></> : <><span className="result-icon">{resultClass === "success" ? <CheckCircle2 aria-hidden /> : resultClass === "warning" ? <AlertTriangle aria-hidden /> : <CircleX aria-hidden />}</span><p className="eyebrow">{result.result === "accepted" ? "ASISTENCIA GUARDADA" : result.result === "duplicate" ? "REGISTRO DUPLICADO" : "NO SE PUDO REGISTRAR"}</p><h2>{resultTitle}</h2><p className="result-help">{resultHelp}</p>{result.student && <div className="student-result"><strong>{result.student.name}</strong><span>{result.student.enrollment} · {result.student.program}</span>{result.session && <span>{result.session}</span>}</div>}{(result.result === "accepted" || result.result === "duplicate") && <button type="button" className="button result-next" onClick={scanNext}><ScanLine aria-hidden />Escanear siguiente</button>}</>}
    </section>
  </div>;
}

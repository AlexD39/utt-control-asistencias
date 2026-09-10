"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/sessions").then((response) => response.json()),
      fetch("/api/demo-badges").then((response) => response.json())
    ]).then(([sessionData, demoData]) => {
      setSessions(sessionData.sessions ?? []);
      setDemoCodes(demoData.codes ?? []);
      if (sessionData.sessions?.[0]) setSessionId(sessionData.sessions[0].id);
    });
    return () => stopCamera();
  }, []);

  async function register(badgeCode: string, source: "qr" | "manual" = "manual") {
    if (!sessionId || !badgeCode.trim() || loading) return;
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ badgeCode: badgeCode.trim(), sessionId, source, deviceTime: new Date().toISOString() })
    });
    const data = await response.json();
    setResult(data);
    setLoading(false);
    if (navigator.vibrate) navigator.vibrate(data.result === "accepted" ? 100 : [100, 70, 100]);
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

  async function startCamera() {
    setResult(null);
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

  const resultClass = result?.result === "accepted" ? "success" : result?.result === "duplicate" ? "warning" : "error";
  return <div className="scanner-layout">
    <section className="card scanner-card">
      <div className="card-head"><div><h2>Punto de registro</h2><p>Selecciona una sesión antes de comenzar.</p></div><span className="pill pill-live">● LISTO</span></div>
      <label>Sesión activa<select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name} · {session.room}</option>)}</select></label>
      {camera ? <div className="camera-box"><video ref={videoRef} muted playsInline /><div className="camera-frame" /><button onClick={stopCamera} className="button button-ghost">Cancelar cámara</button></div> : <button className="camera-trigger" onClick={startCamera}><span>⌗</span><strong>Escanear código QR</strong><small>Usar la cámara posterior</small></button>}
      <div className="divider"><span>o captura un código de prueba</span></div>
      <form onSubmit={submit} className="manual-form"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código del gafete" autoComplete="off" /><button className="button button-primary" disabled={loading}>{loading ? "Validando…" : "Registrar"}</button></form>
      <div className="demo-codes">{demoCodes.length > 0 ? demoCodes.map((demo) => <button type="button" key={demo} onClick={() => setCode(demo)}>{demo}</button>) : <small>No hay códigos demo vigentes.</small>}</div>
    </section>
    <section className={`scan-result ${result ? resultClass : "idle"}`}>
      {!result ? <><span className="result-icon">⌁</span><h2>Esperando lectura</h2><p>El resultado aparecerá aquí inmediatamente.</p></> : <><span className="result-icon">{resultClass === "success" ? "✓" : resultClass === "warning" ? "!" : "×"}</span><p className="eyebrow">{result.result.replaceAll("_", " ")}</p><h2>{result.message}</h2>{result.student && <div className="student-result"><strong>{result.student.name}</strong><span>{result.student.enrollment}</span><span>{result.student.program}</span></div>}</>}
    </section>
  </div>;
}

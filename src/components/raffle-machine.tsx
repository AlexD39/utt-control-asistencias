"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { RotateCcw, Sparkles, Trophy } from "lucide-react";

type Participant = { id: string; name: string; enrollment: string; program: string };

function randomIndex(length: number) {
  if (length <= 1) return 0;
  const maximum = Math.floor(0x1_0000_0000 / length) * length;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= maximum);
  return value[0] % length;
}

function choose(participants: Participant[]) {
  return participants[randomIndex(participants.length)];
}

export function RaffleMachine({ sessionId, sessionName, participants }: { sessionId: string; sessionName: string; participants: Participant[] }) {
  const storageKey = `utt-raffle-winners:${sessionId}`;
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [displayed, setDisplayed] = useState<Participant | null>(participants[0] ?? null);
  const [winner, setWinner] = useState<Participant | null>(null);
  const [drawing, setDrawing] = useState(false);
  const participantIds = useMemo(() => new Set(participants.map((participant) => participant.id)), [participants]);
  const winners = winnerIds.map((id) => participants.find((participant) => participant.id === id)).filter((participant): participant is Participant => Boolean(participant));
  const available = participants.filter((participant) => !winnerIds.includes(participant.id));

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
      setWinnerIds(Array.isArray(stored) ? stored.filter((id) => participantIds.has(id)) : []);
    } catch {
      setWinnerIds([]);
    }
  }, [storageKey, participantIds]);

  function saveWinners(ids: string[]) {
    setWinnerIds(ids);
    localStorage.setItem(storageKey, JSON.stringify(ids));
  }

  function draw() {
    if (drawing || available.length === 0) return;
    setDrawing(true);
    setWinner(null);
    const selected = choose(available);
    let ticks = 0;
    const animation = window.setInterval(() => {
      setDisplayed(choose(available));
      ticks += 1;
      if (ticks >= 34) {
        window.clearInterval(animation);
        setDisplayed(selected);
        setWinner(selected);
        saveWinners([...winnerIds, selected.id]);
        setDrawing(false);
      }
    }, 70);
  }

  function reset() {
    if (!window.confirm("¿Reiniciar la rifa y permitir nuevamente a todos los asistentes?")) return;
    saveWinners([]);
    setWinner(null);
    setDisplayed(participants[0] ?? null);
  }

  return <section className={`raffle-stage ${winner ? "has-winner" : ""}`}>
    {winner && <div className="confetti" aria-hidden>{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ "--x": `${(index * 37) % 100}%`, "--drift": `${((index % 5) - 2) * 45}px`, "--delay": `${(index % 8) * 45}ms`, "--hue": `${index * 47}deg`, "--rotation": `${index * 31}deg` } as CSSProperties} />)}</div>}
    <div className="raffle-status"><span className="pill pill-live"><Sparkles aria-hidden />{participants.length} PARTICIPANTES</span><span>{available.length} disponibles · {winners.length} ganadores</span></div>
    <div className="raffle-drum" aria-live="polite">
      <span className="raffle-icon"><Trophy aria-hidden /></span>
      <p>{drawing ? "Buscando ganador…" : winner ? "¡Tenemos ganador!" : sessionName}</p>
      <h2>{displayed?.name ?? "Sin asistentes registrados"}</h2>
      {displayed && <small>{displayed.enrollment} · {displayed.program}</small>}
    </div>
    <div className="raffle-actions">
      <button className="button button-primary raffle-draw" onClick={draw} disabled={drawing || available.length === 0}>{drawing ? "Sorteando…" : available.length ? "Elegir ganador" : "Todos ya ganaron"}</button>
      <button className="button button-secondary" onClick={reset} disabled={drawing || winnerIds.length === 0}><RotateCcw aria-hidden />Reiniciar</button>
    </div>
    {winners.length > 0 && <div className="raffle-winners"><h3>Ganadores de esta actividad</h3><ol>{winners.map((participant) => <li key={participant.id}><span>{participant.name}</span><small>{participant.enrollment} · {participant.program}</small></li>)}</ol><p>Esta lista queda guardada en este navegador para evitar ganadores repetidos.</p></div>}
  </section>;
}

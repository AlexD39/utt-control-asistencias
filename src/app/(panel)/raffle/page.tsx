import { isAdministrator, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { RaffleMachine } from "@/components/raffle-machine";

type SessionOption = {
  id: string;
  name: string;
  room: string;
  event_name: string;
  session_type: "general" | "workshop" | "access";
  attendees: number;
};

type Participant = { id: string; name: string; enrollment: string; program: string };

export default async function RafflePage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const user = await requireUser(["super_admin", "event_admin"]);
  const sessions = await query<SessionOption>(`SELECT s.id, s.name, s.room, s.session_type, e.name event_name,
    COUNT(a.id)::int attendees
    FROM sessions s JOIN events e ON e.id = s.event_id
    LEFT JOIN attendances a ON a.session_id = s.id
    WHERE s.active AND e.status IN ('active', 'closed')
      AND ($1::boolean OR EXISTS (SELECT 1 FROM event_staff ef WHERE ef.event_id = e.id AND ef.user_id = $2))
    GROUP BY s.id, e.id
    ORDER BY CASE e.status WHEN 'active' THEN 0 ELSE 1 END,
      CASE s.session_type WHEN 'general' THEN 0 WHEN 'workshop' THEN 1 ELSE 2 END,
      s.starts_at DESC`, [isAdministrator(user), user.id]);

  const requestedSession = (await searchParams).session;
  const selected = sessions.rows.find((session) => session.id === requestedSession) ?? sessions.rows[0] ?? null;
  const participants = selected ? await query<Participant>(`SELECT st.id, st.name, st.enrollment, st.program
    FROM attendances a JOIN students st ON st.id = a.student_id
    WHERE a.session_id = $1 AND st.active
    ORDER BY st.name`, [selected.id]) : { rows: [] };

  return <>
    <div className="page-heading"><div><p className="eyebrow">DINÁMICA DEL EVENTO</p><h1>Rifa de asistentes</h1><p>Participan únicamente alumnos cuya asistencia fue confirmada en la actividad elegida.</p></div></div>
    <section className="card raffle-selector">
      <form method="get">
        <label>Actividad para la rifa<select name="session" defaultValue={selected?.id ?? ""} disabled={!sessions.rows.length}>{sessions.rows.map((session) => <option key={session.id} value={session.id}>{session.event_name} · {session.name} ({session.attendees})</option>)}</select></label>
        <button className="button button-secondary" disabled={!sessions.rows.length}>Cargar asistentes</button>
      </form>
      {selected && <p><strong>{selected.name}</strong> · {selected.room} · {selected.attendees} asistencias confirmadas</p>}
    </section>
    {selected ? <RaffleMachine key={selected.id} sessionId={selected.id} sessionName={selected.name} participants={participants.rows} /> : <section className="card empty"><strong>No hay actividades disponibles para realizar la rifa.</strong></section>}
  </>;
}

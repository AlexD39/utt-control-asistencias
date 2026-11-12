export type AttendanceFilters = {
  q: string;
  event: string;
  session: string;
  from: string;
  to: string;
  kind: "" | "initial" | "confirmation";
  source: string;
};

type FilterInput = Partial<Record<keyof AttendanceFilters, string | null | undefined>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f-]{1,64}$/i;

export function normalizeAttendanceFilters(input: FilterInput): AttendanceFilters {
  const from = input.from?.trim() ?? "";
  const to = input.to?.trim() ?? "";
  const event = input.event?.trim() ?? "";
  const session = input.session?.trim() ?? "";
  const kind = input.kind === "initial" || input.kind === "confirmation" ? input.kind : "";
  const source = ["qr", "nfc", "manual"].includes(input.source ?? "") ? input.source! : "";

  return {
    q: input.q?.trim().slice(0, 120) ?? "",
    event: ID.test(event) ? event : "",
    session: ID.test(session) ? session : "",
    from: ISO_DATE.test(from) ? from : "",
    to: ISO_DATE.test(to) ? to : "",
    kind,
    source
  };
}

export function buildAttendanceWhere(filters: AttendanceFilters) {
  const clauses: string[] = [];
  const values: string[] = [];
  const parameter = (value: string) => {
    values.push(value);
    return "$" + values.length;
  };

  if (filters.q) {
    const pattern = "%" + filters.q + "%";
    clauses.push(`(st.name ILIKE ${parameter(pattern)} OR st.enrollment ILIKE ${parameter(pattern)} OR st.program ILIKE ${parameter(pattern)})`);
  }
  if (filters.event) clauses.push(`a.event_id = ${parameter(filters.event)}`);
  if (filters.session) clauses.push(`a.session_id = ${parameter(filters.session)}`);
  if (filters.from) clauses.push(`(a.scanned_at AT TIME ZONE 'America/Mexico_City')::date >= ${parameter(filters.from)}::date`);
  if (filters.to) clauses.push(`(a.scanned_at AT TIME ZONE 'America/Mexico_City')::date <= ${parameter(filters.to)}::date`);
  if (filters.kind === "initial") clauses.push("a.occurrence = 1");
  if (filters.kind === "confirmation") clauses.push("a.occurrence > 1");
  if (filters.source) clauses.push(`a.source = ${parameter(filters.source)}`);

  return { sql: clauses.length ? "WHERE " + clauses.join(" AND ") : "", values };
}

export function attendanceFilterParams(filters: AttendanceFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

export type StudentFilters = {
  q: string;
  program: string;
  status: string;
  credential: string;
};

export function normalizeStudentFilters(input: {
  q?: string | null;
  program?: string | null;
  status?: string | null;
  credential?: string | null;
}): StudentFilters {
  return {
    q: input.q?.trim().slice(0, 100) ?? "",
    program: input.program?.trim().slice(0, 150) ?? "",
    status: input.status === "active" || input.status === "inactive" ? input.status : "",
    credential: input.credential === "assigned" || input.credential === "unassigned" ? input.credential : ""
  };
}

export function buildStudentWhere(filters: StudentFilters) {
  const clauses: string[] = [];
  const values: string[] = [];
  const parameter = (value: string) => {
    values.push(value);
    return "$" + values.length;
  };

  if (filters.q) {
    const pattern = "%" + filters.q + "%";
    clauses.push("(s.name ILIKE " + parameter(pattern) + " OR s.enrollment ILIKE " + parameter(pattern) + " OR COALESCE(s.email, '') ILIKE " + parameter(pattern) + ")");
  }
  if (filters.program) clauses.push("s.program = " + parameter(filters.program));
  if (filters.status) clauses.push("s.active = " + (filters.status === "active" ? "TRUE" : "FALSE"));
  if (filters.credential) clauses.push(filters.credential === "assigned" ? "b.id IS NOT NULL AND b.active = TRUE" : "(b.id IS NULL OR b.active = FALSE)");

  return { sql: clauses.length ? "WHERE " + clauses.join(" AND ") : "", values };
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

const demoCodes = ["DEMO-ANA-7K2P", "DEMO-DIEGO-8M4Q", "DEMO-FER-2N9R", "DEMO-JORGE-5T1X", "DEMO-VALE-4C6W", "DEMO-EMI-3B8Z"];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (process.env.NODE_ENV === "production") return NextResponse.json({ codes: [] });
  const { rows } = await query<{ code: string }>(`SELECT candidate.code FROM unnest($1::text[]) candidate(code)
    JOIN badges b ON b.token_hash = encode(digest(candidate.code, 'sha256'), 'hex')
    WHERE b.active = TRUE ORDER BY candidate.code`, [demoCodes]);
  return NextResponse.json({ codes: rows.map((row) => row.code) });
}

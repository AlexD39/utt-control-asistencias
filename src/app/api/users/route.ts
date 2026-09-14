import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { createUserSchema } from "@/lib/user-schemas";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const created = await query<{ id: string }>(`INSERT INTO users (name, email, password_hash, role, active)
      VALUES ($1, $2, $3, $4, $5) RETURNING id`, [parsed.data.name, parsed.data.email, passwordHash, parsed.data.role, parsed.data.active]);
    return NextResponse.json(created.rows[0], { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "El correo ya pertenece a otro usuario" }, { status: 409 });
    return NextResponse.json({ error: "No fue posible crear el usuario" }, { status: 500 });
  }
}

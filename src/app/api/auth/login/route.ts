import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { createSessionToken, setSessionCookie, type Role } from "@/lib/auth";

const schema = z.object({ email: z.email(), password: z.string().min(6).max(100) });

type UserRow = { id: string; name: string; email: string; password_hash: string; role: Role; active: boolean };

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos de acceso inválidos" }, { status: 400 });

  const result = await query<UserRow>(
    "SELECT id, name, email, password_hash, role, active FROM users WHERE lower(email) = lower($1)",
    [parsed.data.email]
  );
  const user = result.rows[0];
  if (!user || !user.active || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
  }

  await setSessionCookie(await createSessionToken(user));
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}


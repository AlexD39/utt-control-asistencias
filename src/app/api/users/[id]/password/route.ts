import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { passwordSchema } from "@/lib/user-schemas";

const schema = z.object({ password: passwordSchema });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Contraseña inválida" }, { status: 400 });
  const { id } = await context.params;
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const updated = await query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, id]);
  if (updated.rowCount !== 1) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Role = "super_admin" | "event_admin" | "scanner" | "viewer";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const COOKIE_NAME = "congreso_session";
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "solo-desarrollo-cambia-esta-clave-insegura"
);

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.name || !payload.email || !payload.role) return null;
    return {
      id: payload.sub,
      name: String(payload.name),
      email: String(payload.email),
      role: payload.role as Role
    };
  } catch {
    return null;
  }
}

export async function requireUser(roles?: Role[]) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export function roleLabel(role: Role) {
  return {
    super_admin: "Superadministración",
    event_admin: "Administración de evento",
    scanner: "Registro",
    viewer: "Consulta"
  }[role];
}


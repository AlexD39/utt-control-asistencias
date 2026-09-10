"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";
import { InstitutionBrand } from "@/components/institution-brand";

const items = [
  { href: "/dashboard", label: "Resumen", icon: "⌂", roles: ["super_admin", "event_admin", "scanner", "viewer"] },
  { href: "/events", label: "Congresos", icon: "▦", roles: ["super_admin", "event_admin", "viewer"] },
  { href: "/scanner", label: "Escanear", icon: "⌗", roles: ["super_admin", "event_admin", "scanner"] },
  { href: "/attendances", label: "Asistencias", icon: "✓", roles: ["super_admin", "event_admin", "viewer"] },
  { href: "/students", label: "Alumnos", icon: "◎", roles: ["super_admin", "event_admin", "viewer"] },
  { href: "/users", label: "Equipo y permisos", icon: "◇", roles: ["super_admin"] }
] as const;

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <InstitutionBrand compact />
      <nav>
        <p className="nav-caption">OPERACIÓN</p>
        {items.filter((item) => (item.roles as readonly Role[]).includes(role)).map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href || pathname.startsWith(item.href + "/") ? "nav-link active" : "nav-link"}>
            <span>{item.icon}</span>{item.label}
          </Link>
        ))}
      </nav>
      <form action="/api/auth/logout" method="post"><button className="nav-link logout" type="submit"><span>↪</span>Cerrar sesión</button></form>
    </aside>
  );
}

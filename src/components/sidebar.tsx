"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, GraduationCap, LayoutDashboard, ScanLine, UsersRound, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/auth";
import { InstitutionBrand } from "@/components/institution-brand";
import { LogoutButton } from "@/components/logout-button";

const items = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard, roles: ["super_admin", "event_admin", "scanner", "viewer"] },
  { href: "/events", label: "Congresos", icon: CalendarDays, roles: ["super_admin", "event_admin", "viewer"] },
  { href: "/scanner", label: "Escanear", icon: ScanLine, roles: ["super_admin", "event_admin", "scanner"] },
  { href: "/attendances", label: "Asistencias", icon: ClipboardCheck, roles: ["super_admin", "event_admin", "viewer"] },
  { href: "/students", label: "Alumnos", icon: GraduationCap, roles: ["super_admin", "event_admin", "viewer"] },
  { href: "/users", label: "Equipo y permisos", icon: UsersRound, roles: ["super_admin"] }
] satisfies Array<{ href: string; label: string; icon: LucideIcon; roles: Role[] }>;

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <InstitutionBrand compact />
      <nav>
        <p className="nav-caption">OPERACIÓN</p>
        {items.filter((item) => item.roles.includes(role)).map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={pathname === item.href || pathname.startsWith(item.href + "/") ? "nav-link active" : "nav-link"}>
            <Icon aria-hidden />{item.label}
          </Link>;
        })}
      </nav>
      <LogoutButton />
    </aside>
  );
}

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { requireUser } from "@/lib/auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="app-shell"><Sidebar role={user.role} /><div className="content-shell"><Topbar user={user} /><main className="page">{children}</main></div></div>;
}


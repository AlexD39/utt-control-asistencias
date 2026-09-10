import { initials } from "@/lib/format";
import { roleLabel, type SessionUser } from "@/lib/auth";

export function Topbar({ user }: { user: SessionUser }) {
  return (
    <header className="topbar">
      <div className="connection"><span className="status-dot" /> Sistema local conectado</div>
      <div className="profile"><div className="avatar">{initials(user.name)}</div><div><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></div></div>
    </header>
  );
}


"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirming]);

  return <>
    <button className={compact ? "mobile-logout-trigger" : "nav-link logout"} type="button" onClick={() => setConfirming(true)}>
      <LogOut aria-hidden />{compact ? "Salir" : "Cerrar sesión"}
    </button>
    {confirming && <div className="confirm-overlay" role="presentation" onMouseDown={() => setConfirming(false)}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="confirm-icon" aria-hidden><LogOut /></span>
        <h2 id="logout-title">¿Cerrar sesión?</h2>
        <p>Tendrás que ingresar nuevamente tus datos para continuar.</p>
        <div className="confirm-actions">
          <button className="button button-secondary" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
          <form action="/api/auth/logout" method="post"><button className="button button-primary" type="submit">Sí, cerrar sesión</button></form>
        </div>
      </section>
    </div>}
  </>;
}

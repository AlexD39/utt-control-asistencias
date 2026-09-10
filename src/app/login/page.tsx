"use client";

import { FormEvent, useState } from "react";
import { InstitutionBrand } from "@/components/institution-brand";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") })
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "No fue posible iniciar sesión");
      setLoading(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <main className="login-shell">
      <section className="login-copy">
        <InstitutionBrand />
        <div>
          <p className="eyebrow">CONTROL DE ACCESO</p>
          <h1>Cada llegada,<br />bien registrada.</h1>
          <p className="lead">Asistencia rápida y verificable para eventos universitarios, incluso cuando la conexión no coopera.</p>
        </div>
        <p className="login-foot">Universidad Tecnológica de Tehuacán · Entorno local</p>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div>
            <p className="eyebrow">BIENVENIDO</p>
            <h2>Inicia sesión</h2>
            <p>Accede con la cuenta asignada por la coordinación.</p>
          </div>
          <label>Correo electrónico<input name="email" type="email" defaultValue="admin@congreso.local" required /></label>
          <label>Contraseña<input name="password" type="password" defaultValue="Admin123!" required /></label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="button button-primary" disabled={loading}>{loading ? "Ingresando…" : "Ingresar al sistema"}</button>
          <div className="demo-note"><strong>Cuenta de demostración</strong><br />admin@congreso.local · Admin123!</div>
        </form>
      </section>
    </main>
  );
}

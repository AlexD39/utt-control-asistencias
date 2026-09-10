import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UTT Tehuacán · Control de asistencia",
  description: "Registro de asistencia de la Universidad Tecnológica de Tehuacán"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

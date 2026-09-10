import { Scanner } from "@/components/scanner";
import { requireUser } from "@/lib/auth";

export default async function ScannerPage() {
  await requireUser(["super_admin", "event_admin", "scanner"]);
  return <><div className="page-heading"><div><p className="eyebrow">CONTROL DE ACCESO</p><h1>Registrar asistencia</h1><p>Escanea un QR o utiliza un código simulado.</p></div></div><Scanner /></>;
}


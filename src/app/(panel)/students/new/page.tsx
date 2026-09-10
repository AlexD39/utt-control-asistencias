import Link from "next/link";
import { StudentForm } from "@/components/student-form";
import { requireUser } from "@/lib/auth";

export default async function NewStudentPage() {
  await requireUser(["super_admin", "event_admin"]);
  return <><div className="page-heading"><div><p className="eyebrow">PADRÓN / NUEVO</p><h1>Registrar alumno</h1><p>El alta genera una nueva credencial QR y NFC automáticamente.</p></div><Link href="/students" className="button button-secondary">← Volver al padrón</Link></div><StudentForm /></>;
}


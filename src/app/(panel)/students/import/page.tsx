import Link from "next/link";
import { StudentImport } from "@/components/student-import";
import { requireUser } from "@/lib/auth";

export default async function ImportStudentsPage() {
  await requireUser(["super_admin", "event_admin"]);
  return <>
    <div className="page-heading"><div><p className="eyebrow">PADRÓN · IMPORTACIÓN</p><h1>Importar alumnos</h1><p>Carga o actualiza el padrón utilizando un archivo CSV.</p></div><Link href="/students" className="button button-secondary">← Volver al padrón</Link></div>
    <StudentImport />
  </>;
}

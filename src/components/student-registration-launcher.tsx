"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { StudentForm } from "@/components/student-form";

type Workshop = { id: string; code: string; name: string; capacity: number | null; enrolled: number };

export function StudentRegistrationLauncher({ eventName, workshops }: { eventName?: string; workshops: Workshop[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  function close() { setOpen(false); router.refresh(); }
  return <>
    <button className="button button-primary" onClick={() => setOpen(true)}><Plus aria-hidden />Registrar alumno</button>
    <Modal open={open} title="Registrar alumno" description="Datos básicos, tipo de credencial y talleres en un solo flujo." onClose={close} wide>
      <StudentForm eventName={eventName} workshops={workshops} onCancel={close} />
    </Modal>
  </>;
}

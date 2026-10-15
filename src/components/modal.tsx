"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function Modal({ open, title, description, onClose, children, wide = false }: {
  open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={wide ? "app-modal app-modal-wide" : "app-modal"} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-surface">
      <div className="modal-head"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" className="icon-button" title="Cerrar" aria-label="Cerrar ventana" onClick={onClose}><X aria-hidden /></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </dialog>;
}

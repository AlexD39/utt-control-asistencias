import Image from "next/image";

export function InstitutionBrand({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "institution-brand compact" : "institution-brand"}>
    <Image className="utt-logo" src="/logo_utt.png" width={632} height={234} alt="Universidad Tecnológica de Tehuacán" priority />
    {!compact && <span className="system-name">Control de asistencias</span>}
  </div>;
}

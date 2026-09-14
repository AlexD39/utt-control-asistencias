export const NFC_PAYLOAD_PREFIX = "UTT-NFC:";

export type NdefRecordLike = {
  recordType: string;
  data?: DataView;
  encoding?: string;
};

export type NdefReadingEventLike = {
  serialNumber?: string;
  message: { records: NdefRecordLike[] };
};

export type NdefReaderLike = {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: { records: Array<{ recordType: "text"; data: string }> }, options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NdefReadingEventLike) => void) | null;
  onreadingerror: (() => void) | null;
};

type NdefReaderConstructor = new () => NdefReaderLike;

export function getNdefReader() {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { NDEFReader?: NdefReaderConstructor }).NDEFReader;
}

export function nfcPayload(credential: string) {
  return NFC_PAYLOAD_PREFIX + credential.trim();
}

export function readCredentialFromNdef(event: NdefReadingEventLike) {
  for (const record of event.message.records) {
    if ((record.recordType === "text" || record.recordType === "url") && record.data) {
      const value = new TextDecoder(record.encoding || "utf-8").decode(record.data).trim();
      if (value.startsWith(NFC_PAYLOAD_PREFIX)) return value.slice(NFC_PAYLOAD_PREFIX.length).trim();
      if (value) return value;
    }
  }
  return null;
}

export function nfcErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Permiso NFC rechazado. Autorízalo en Chrome e inténtalo nuevamente.";
  if (name === "NotSupportedError") return "El chip no utiliza un formato NDEF compatible.";
  if (name === "NotReadableError") return "No fue posible leer el chip. Aléjalo y vuelve a acercarlo.";
  if (name === "NetworkError") return "La escritura falló. El chip puede estar bloqueado o fuera de alcance.";
  if (name === "AbortError") return "La operación NFC fue cancelada o agotó el tiempo de espera.";
  return "No fue posible completar la operación NFC. Verifica que NFC esté encendido.";
}

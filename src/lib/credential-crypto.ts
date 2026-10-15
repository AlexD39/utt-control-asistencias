import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type SealedCredential = { ciphertext: string; iv: string; tag: string };

function encryptionKey() {
  const configured = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY debe contener 32 bytes en base64");
    return decoded;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Falta CREDENTIAL_ENCRYPTION_KEY en producción");
  return createHash("sha256").update(process.env.JWT_SECRET ?? "solo-desarrollo-cambia-esta-clave-insegura").digest();
}

export function sealCredential(value: string): SealedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function openCredential(sealed: SealedCredential) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

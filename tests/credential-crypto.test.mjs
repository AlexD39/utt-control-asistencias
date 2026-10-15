import test from "node:test";
import assert from "node:assert/strict";
import { openCredential, sealCredential } from "../src/lib/credential-crypto.ts";

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

test("cifra y recupera una credencial sin almacenarla en texto plano", () => {
  const credential = "UTT-TEST-SEGURA-123";
  const sealed = sealCredential(credential);
  assert.notEqual(sealed.ciphertext, credential);
  assert.equal(openCredential(sealed), credential);
});

test("rechaza una credencial cifrada alterada", () => {
  const sealed = sealCredential("UTT-TEST-INTEGRIDAD");
  assert.throws(() => openCredential({ ...sealed, tag: Buffer.alloc(16).toString("base64") }));
});

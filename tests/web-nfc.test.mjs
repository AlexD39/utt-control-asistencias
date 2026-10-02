import assert from "node:assert/strict";
import test from "node:test";
import {
  NFC_PAYLOAD_PREFIX,
  getNdefReader,
  nfcErrorMessage,
  nfcPayload,
  readCredentialFromNdef
} from "../src/lib/web-nfc.ts";

function ndefRecord(value, recordType = "text") {
  const bytes = new TextEncoder().encode(value);
  return { recordType, data: new DataView(bytes.buffer), encoding: "utf-8" };
}

test("genera el payload UTT sin espacios accidentales", () => {
  assert.equal(nfcPayload("  DEMO-ANA-7K2P  "), `${NFC_PAYLOAD_PREFIX}DEMO-ANA-7K2P`);
});

test("simula escritura y lectura NDEF de una credencial", () => {
  const credential = "DEMO-ANA-7K2P";
  const event = { message: { records: [ndefRecord(nfcPayload(credential))] } };
  assert.equal(readCredentialFromNdef(event), credential);
});

test("conserva correctamente caracteres UTF-8", () => {
  const credential = "UTT-TEHUACÁN-Ñ-2026";
  const event = { message: { records: [ndefRecord(nfcPayload(credential))] } };
  assert.equal(readCredentialFromNdef(event), credential);
});

test("acepta una credencial NDEF heredada sin prefijo", () => {
  const event = { message: { records: [ndefRecord("DEMO-DIEGO-8M4Q", "url")] } };
  assert.equal(readCredentialFromNdef(event), "DEMO-DIEGO-8M4Q");
});

test("ignora registros NFC no compatibles", () => {
  const event = { message: { records: [ndefRecord("dato", "mime")] } };
  assert.equal(readCredentialFromNdef(event), null);
});

test("detecta la API NDEFReader expuesta por el navegador", () => {
  class MockNDEFReader {}
  globalThis.window = { NDEFReader: MockNDEFReader };
  assert.equal(getNdefReader(), MockNDEFReader);
  delete globalThis.window;
  assert.equal(getNdefReader(), undefined);
});

test("traduce errores conocidos de Web NFC", () => {
  assert.match(nfcErrorMessage(new DOMException("", "NotAllowedError")), /Permiso NFC rechazado/);
  assert.match(nfcErrorMessage(new DOMException("", "NotSupportedError")), /NDEF compatible/);
  assert.match(nfcErrorMessage(new DOMException("", "NotReadableError")), /No fue posible leer/);
  assert.match(nfcErrorMessage(new DOMException("", "NetworkError")), /escritura falló/);
  assert.match(nfcErrorMessage(new DOMException("", "AbortError")), /cancelada/);
  assert.match(nfcErrorMessage(new Error("otro")), /NFC esté encendido/);
});

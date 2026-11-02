import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { generateBadgeCode } from "../src/lib/badges.ts";
import { parseStudentImportFile } from "../src/lib/student-import-file.ts";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function createWorkbook(rows) {
  const worksheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Alumnos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${worksheetRows}</sheetData></worksheet>`
  };

  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)]))));
}

test("lee un Excel con 400 alumnos sin perder matrículas, acentos ni talleres", async () => {
  const rows = [
    ["Matrícula", "Nombre", "Correo", "Programa", "Talleres", "TipoCredencial", "Usos"],
    ...Array.from({ length: 400 }, (_, index) => [
      `UTT${String(index + 1).padStart(5, "0")}`,
      `Alumno número ${index + 1}`,
      `alumno${index + 1}@utt.edu.mx`,
      "Tecnologías de la Información",
      "IA-01|ROB-02",
      "limitada",
      "3"
    ])
  ];

  const parsed = await parseStudentImportFile("alumnos.xlsx", createWorkbook(rows));
  assert.equal(parsed.length, 401);
  assert.deepEqual(parsed[0], rows[0]);
  assert.deepEqual(parsed[400], rows[400]);
});

test("genera credenciales únicas con el formato esperado", () => {
  const credentials = Array.from({ length: 1_000 }, generateBadgeCode);
  assert.equal(new Set(credentials).size, credentials.length);
  for (const credential of credentials) assert.match(credential, /^UTT-[0-9A-F]{24}$/);
});

test("el QR generado por la credencial se puede decodificar sin alterar el token", async () => {
  const credential = generateBadgeCode();
  const buffer = await QRCode.toBuffer(credential, {
    width: 420,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0b2e4f", light: "#ffffff" }
  });
  const image = PNG.sync.read(buffer);
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height, { inversionAttempts: "attemptBoth" });
  assert.equal(decoded?.data, credential);
});

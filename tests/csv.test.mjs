import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCsvHeader, parseCsv } from "../src/lib/csv.ts";

test("interpreta CSV de Excel con BOM, acentos y comas", () => {
  const rows = parseCsv('\uFEFFMatrícula,Nombre,Programa,Talleres\r\nA001,"López, Ana",Sistemas,IA-01|ROB-02\r\n');
  assert.deepEqual(rows, [
    ["Matrícula", "Nombre", "Programa", "Talleres"],
    ["A001", "López, Ana", "Sistemas", "IA-01|ROB-02"]
  ]);
});

test("interpreta punto y coma y saltos de línea dentro de comillas", () => {
  const rows = parseCsv('Matrícula;Nombre;Programa\nA002;"Diego\nHernández";Administración');
  assert.equal(rows[1][1], "Diego\nHernández");
  assert.equal(rows[1][2], "Administración");
});

test("normaliza encabezados en español e inglés", () => {
  assert.equal(normalizeCsvHeader(" Tipo de credencial "), "tipodecredencial");
  assert.equal(normalizeCsvHeader("Matrícula"), "matricula");
  assert.equal(normalizeCsvHeader("workshop_codes"), "workshopcodes");
});

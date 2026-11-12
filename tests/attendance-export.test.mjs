import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { attendanceFilterParams, buildAttendanceWhere, normalizeAttendanceFilters } from "../src/lib/attendance-query.ts";
import { parseStudentImportFile } from "../src/lib/student-import-file.ts";
import { createXlsx } from "../src/lib/xlsx.ts";

test("normaliza filtros de asistencias y descarta valores no permitidos", () => {
  const filters = normalizeAttendanceFilters({
    q: "  Ana  ", event: "45bfc3a7-03d5-4bc7-a3e7-9b027d529963", session: "no válido",
    from: "2026-11-11", to: "ayer", kind: "confirmation", source: "otro"
  });
  assert.deepEqual(filters, {
    q: "Ana", event: "45bfc3a7-03d5-4bc7-a3e7-9b027d529963", session: "",
    from: "2026-11-11", to: "", kind: "confirmation", source: ""
  });
  assert.equal(attendanceFilterParams(filters).toString(), "q=Ana&event=45bfc3a7-03d5-4bc7-a3e7-9b027d529963&from=2026-11-11&kind=confirmation");
});

test("construye filtros parametrizados por fecha local y confirmación", () => {
  const filters = normalizeAttendanceFilters({ q: "UTT001", from: "2026-11-11", to: "2026-11-12", kind: "initial", source: "qr" });
  const where = buildAttendanceWhere(filters);
  assert.match(where.sql, /America\/Mexico_City/);
  assert.match(where.sql, /a\.occurrence = 1/);
  assert.match(where.sql, /a\.source = \$6/);
  assert.deepEqual(where.values, ["%UTT001%", "%UTT001%", "%UTT001%", "2026-11-11", "2026-11-12", "qr"]);
});

test("genera un archivo XLSX válido con acentos, autofiltro y encabezado fijo", async () => {
  const workbook = createXlsx(["Matrícula", "Alumno", "Tipo"], [["UTT001", "Ana López", "Confirmación 1"]], "Asistencias");
  assert.equal(Buffer.from(workbook).subarray(0, 2).toString(), "PK");
  const files = unzipSync(workbook);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /autoFilter/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /Confirmación 1/);

  const parsed = await parseStudentImportFile("asistencias.xlsx", Buffer.from(workbook));
  assert.deepEqual(parsed, [["Matrícula", "Alumno", "Tipo"], ["UTT001", "Ana López", "Confirmación 1"]]);
});

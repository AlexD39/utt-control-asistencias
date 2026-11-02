import { readSheet } from "read-excel-file/node";

export const MAX_IMPORT_FILE_BYTES = 5_000_000;
export const MAX_IMPORT_STUDENTS = 5_000;

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export async function parseStudentImportFile(fileName: string, content: Buffer) {
  const normalizedName = fileName.trim().toLowerCase();
  if (normalizedName.endsWith(".xlsx")) {
    const rows = await readSheet(content);
    return rows.map((row) => row.map(cellText)).filter((row) => row.some(Boolean));
  }
  throw new Error("UNSUPPORTED_FILE");
}

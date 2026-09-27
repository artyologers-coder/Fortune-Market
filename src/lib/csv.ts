/**
 * Minimal RFC 4180 CSV serialisation for admin report exports.
 *
 * The project has no export infrastructure, so this is intentionally small:
 * build rows in the route handler, pass them here, return the string with a
 * Content-Disposition attachment header.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
  return [header, ...body].join("\r\n");
}

/**
 * Strips characters that are unsafe in a Content-Disposition filename and
 * prevents a caller-supplied name from escaping the header.
 */
export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export function csvResponse<T>(rows: T[], columns: CsvColumn<T>[], filename: string) {
  const csv = toCsv(rows, columns);
  // A BOM makes Excel open UTF-8 CSVs without mangling Sinhala text.
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(filename)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

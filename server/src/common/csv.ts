const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Quote a CSV cell and neutralise spreadsheet formula injection (CWE-1236). Numbers are passed through. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" || typeof value === "bigint") return `"${String(value)}"`;
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return lines.join("\r\n") + "\r\n";
}

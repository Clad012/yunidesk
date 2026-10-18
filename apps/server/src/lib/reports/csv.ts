export type CsvCell = string | number | null;

/**
 * One CSV field (RFC 4180): quoted when it holds a comma, a quote or a line break, quotes doubled.
 * Text starting with = + - @ (or a tab/CR) is prefixed with ' so spreadsheets never run it as a
 * formula (teammate and tag names are typed by people). Numbers are written as they are.
 */
export function csvField(value: CsvCell): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header + rows, CRLF line endings, as spreadsheets expect. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

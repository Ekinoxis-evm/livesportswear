/** Pure RFC-4180 CSV encoding. No DB, no time. */

export type CsvCell = string | number | null | undefined;

function encodeCell(cell: CsvCell): string {
  if (cell == null) return "";
  const s = String(cell);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(encodeCell).join(",")).join("\r\n");
}

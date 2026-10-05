// Deliberately not using a library here — after fixing a cascade of
// dependency-resolution issues elsewhere in this project, adding another
// npm package for a simple comma-separated format isn't worth the risk.
// Assumes plain fields (no embedded commas/quotes), which is fine for
// names, emails, roll numbers, and dates.
export function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] || "";
    });
    return row;
  });
}

// ---------- V2: export ----------
// RFC 4180 quoting + UTF-8 BOM so Excel opens ₹ and accents correctly.
// Cells starting with = + - @ are prefixed with ' to prevent spreadsheet formula injection.
export function toCsv(headers, rows) {
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
export function exportCsv(filename, headers, rows) {
  const blob = new Blob(["\ufeff" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// CSV Export utility
export function exportCSV(data, columns, filename) {
  if (!data.length) return;

  const header = columns.map(c => c.label).join(",");
  const rows = data.map(row =>
    columns.map(c => {
      let val = typeof c.accessor === "function" ? c.accessor(row) : row[c.key] ?? "";
      val = String(val).replace(/"/g, '""');
      if (val.includes(",") || val.includes('"') || val.includes("\n")) val = `"${val}"`;
      return val;
    }).join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// CSV parser \u2192 array of row objects keyed by the header row. Handles quoted
// fields with embedded commas/newlines and "" escapes, and a leading BOM.
export function parseCSV(text) {
  const s = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else { field += ch; }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(c => (c ?? "").trim() !== ""))
    .map(r => { const o = {}; header.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); }); return o; });
}

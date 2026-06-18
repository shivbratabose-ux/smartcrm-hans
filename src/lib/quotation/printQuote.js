// ═══════════════════════════════════════════════════════════════════
// printQuote — client-facing print / PDF for engine-built quotes
// ═══════════════════════════════════════════════════════════════════
// Phase E. Opens a clean print window (browser "Save as PDF") for a
// Hans-pricing quote: party block, line items, summary with GST split,
// ALR shown separately, and terms. No external deps. Reads q.hans (the
// engine breakdown stored by HansQuoteBuilder).
// ═══════════════════════════════════════════════════════════════════

const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function printHansQuote(quote, opts = {}) {
  const h = quote.hans || {};
  const party = h.party || {};
  const seller = opts.seller || {
    name: "Hans Infomatic Pvt. Ltd.",
    line: "A-1023, Surya Bhawan, Road No. 6, Mahipalpur, New Delhi 110037",
    extra: "CIN: 55-74674 · GST 18% as applicable",
  };
  const items = quote.items || [];

  const lineRows = items.map((it) => `
    <tr>
      <td>${it.lineNo}</td>
      <td><b>${esc(it.name)}</b><div class="muted">${esc(it.module)} · ${esc(it.description)}</div></td>
      <td>${esc(it.pricingModel)}</td>
      <td class="r">${it.qty}</td>
      <td class="r">${it.months}</td>
      <td class="r">${inr(it.unitPriceResolved)}</td>
      <td class="r">${it.discountPct || 0}%</td>
      <td class="r"><b>${inr(it.lineTotal)}</b></td>
    </tr>`).join("");

  const sumRow = (label, val, cls = "") => `<tr class="${cls}"><td>${esc(label)}</td><td class="r">${val}</td></tr>`;
  const gstRows = h.intraState
    ? sumRow(`CGST`, inr(h.cgst)) + sumRow(`SGST`, inr(h.sgst))
    : sumRow(`IGST`, inr(h.igst));

  // Prefer the rep's edited free-text terms; fall back to the structured list.
  const termsBlock = h.termsText && String(h.termsText).trim()
    ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;margin:0">${esc(h.termsText)}</pre>`
    : `<ul>${(h.terms || []).map((t) => `<li><b>${esc(t.key)}:</b> ${esc(t.text)}</li>`).join("")}</ul>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(quote.quoteNo || "Quotation")}</title>
  <style>
    *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0;padding:32px;font-size:12.5px}
    h1{font-size:20px;margin:0} .muted{color:#64748b;font-size:10.5px}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:16px}
    .meta{text-align:right} .meta b{font-size:14px}
    .party{display:flex;justify-content:space-between;margin-bottom:16px}
    .box{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;min-width:46%}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}
    th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
    th{background:#f1f5f9;font-size:10px;text-transform:uppercase;color:#475569}
    .r{text-align:right} .sum{width:320px;margin-left:auto} .sum td{border:none;padding:3px 8px}
    .sum .grand td{border-top:2px solid #0f172a;font-size:15px;font-weight:800;padding-top:8px}
    .sum .sub td{border-top:1px solid #cbd5e1;font-weight:700}
    .alr{color:#475569;font-style:italic} ul{font-size:11px;color:#334155;line-height:1.5}
    .badge{display:inline-block;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700}
    @media print{body{padding:0}}
  </style></head><body>
    <div class="head">
      <div><h1>${esc(seller.name)}</h1><div class="muted">${esc(seller.line)}<br>${esc(seller.extra)}</div></div>
      <div class="meta"><b>QUOTATION</b><div>${esc(quote.quoteNo || "")}</div><div class="muted">${esc(quote.createdDate || "")}</div>
        <div class="badge">${esc(quote.status || "Draft")}</div></div>
    </div>
    <div class="party">
      <div class="box"><div class="muted">BILL TO</div><b>${esc(party.name)}</b><div>${esc(party.address)}</div>
        <div class="muted">State: ${esc(party.state) || "—"} · GSTIN: ${esc(party.gstin) || "—"}</div></div>
      <div class="box"><div class="muted">PREPARED BY</div><b>${esc(quote.preparedBy || "")}</b>
        <div class="muted">Currency: ${esc(h.currency || "INR")}</div></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Model</th><th class="r">Qty</th><th class="r">Months</th><th class="r">Unit</th><th class="r">Disc</th><th class="r">Line total</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    <table class="sum">
      ${sumRow("One-time subtotal", inr(h.oneTimeSubtotal))}
      ${sumRow("Recurring subtotal", inr(h.recurringSubtotal))}
      ${h.overallDiscount ? sumRow("Overall discount", "− " + inr(h.overallDiscount)) : ""}
      ${h.prepaymentDisc ? sumRow("Prepayment discount", "− " + inr(h.prepaymentDisc)) : ""}
      ${sumRow("Taxable value", inr(h.taxableBase), "sub")}
      ${gstRows}
      ${sumRow("GRAND TOTAL (upfront, incl. GST)", inr(h.grandTotal), "grand")}
      ${h.alrAnnual ? `<tr class="alr"><td>ALR — annual (billed separately, excl. above)</td><td class="r">${inr(h.alrAnnual)}</td></tr>` : ""}
      ${sumRow("Total Contract Value (TCV)", inr(h.tcv), "sub")}
    </table>
    <h3 style="font-size:12px;margin:18px 0 4px">Terms &amp; Conditions</h3>
    ${termsBlock}
    ${quote.notes ? `<div class="muted" style="margin-top:10px"><b>Notes:</b> ${esc(quote.notes)}</div>` : ""}
    <script>window.onload=function(){window.print();}</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { alert("Please allow pop-ups to print/export the quote."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

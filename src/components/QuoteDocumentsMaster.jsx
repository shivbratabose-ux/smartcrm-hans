// Masters → Quotation Pricing → Documents: the ULA (software licence) and the
// Agreement that go to the customer with every bill. Plain text with
// {{placeholders}}; the CRM fills them from the quote + KYC (handoverCore.js).
import { useState } from "react";
import { FileText, AlertTriangle, Check } from "lucide-react";
import { DOC_KINDS, DOC_PLACEHOLDERS, resolveDocuments, docContext, fillTemplate } from "../lib/quotation/handover";

// A made-up quote, only to preview how the placeholders fill.
const SAMPLE = {
  quoteNo: "SQ/M000123/26-27", version: 1, createdDate: "2026-11-14", hosting: "Hans",
  legalName: "Sample Logistics Pvt Ltd", pan: "ABCDE1234F", gstin: "27ABCDE1234F1Z5",
  billingAddressSnapshot: "Plot 1, Sample Estate, Mumbai, Maharashtra 400001",
  paymentTerms: "100% advance", total: 5.9, taxAmount: 0.9,
  items: [{ name: "iCAFFE Customs", module: "Customs", qty: 25, unit: "User", months: 12 }, { name: "OCR add-on", qty: 1, unit: "Site" }],
  handover: { billNo: "PI-SQ/M000123/26-27" },
};

export default function QuoteDocumentsMaster({ masters, setMasters }) {
  const docs = resolveDocuments(masters);
  const [open, setOpen] = useState(DOC_KINDS[0].key);
  const doc = docs.find((d) => d.key === open);
  const write = (key, patch) => setMasters((m) => {
    const q = m?.quotation || {};
    const cur = q.documents || {};
    return { ...m, quotation: { ...q, documents: { ...cur, [key]: { title: doc.title, body: doc.body, ...(cur[key] || {}), ...patch } } } };
  });
  const preview = fillTemplate(doc.body, docContext(SAMPLE, { today: new Date().toISOString().slice(0, 10) }));
  const unknown = [...doc.body.matchAll(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !DOC_PLACEHOLDERS.some(([p]) => p === k));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {docs.map((d) => (
            <button key={d.key} type="button" className={`btn btn-sm ${open === d.key ? "btn-primary" : "btn-sec"}`} onClick={() => setOpen(d.key)}>
              <FileText size={12} />{d.title}{d.body.trim().length >= 40 ? <Check size={12} /> : null}
            </button>
          ))}
        </div>
        <div className="form-group">
          <label>Document title</label>
          <input value={doc.title} onChange={(e) => write(doc.key, { title: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Text — paste your approved wording; use the placeholders below for anything from the quote</label>
          <textarea rows={18} value={doc.body} onChange={(e) => write(doc.key, { body: e.target.value })}
            placeholder={"Paste the approved " + doc.title + " here.\n\nExample: This licence is granted to {{customer.legalName}} (PAN {{customer.pan}}, GSTIN {{customer.gstin}}) for {{users}} users of:\n{{modules}}"}
            style={{ fontFamily: "Consolas, 'Courier New', monospace", fontSize: 12, lineHeight: 1.5 }} />
        </div>
        {!doc.body.trim() && (
          <div style={{ fontSize: 12, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
            <AlertTriangle size={12} style={{ verticalAlign: -2 }} /> Empty — the Accounts pack and the customer's bill page leave this document out until it is filled in.
          </div>
        )}
        {unknown.length > 0 && (
          <div style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>Unknown placeholder{unknown.length > 1 ? "s" : ""}: {unknown.map((k) => `{{${k}}}`).join(", ")} — check the spelling against the list.</div>
        )}
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4, fontWeight: 700, letterSpacing: ".4px" }}>PLACEHOLDERS — click to copy</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {DOC_PLACEHOLDERS.map(([k, label]) => (
            <button key={k} type="button" title={label} onClick={() => navigator.clipboard?.writeText(`{{${k}}}`)}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "Consolas, monospace" }}>
              {`{{${k}}}`} <span style={{ color: "var(--text3)", fontFamily: "inherit" }}>· {label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6, fontWeight: 700, letterSpacing: ".4px" }}>PREVIEW — filled from a sample quote</div>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", fontSize: 12, maxHeight: 560, overflowY: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{doc.title}</div>
          {doc.body.trim() ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <div style={{ color: "var(--text3)" }}>Nothing yet.</div>}
        </div>
        {preview.missing.length > 0 && doc.body.trim() && (
          <div style={{ fontSize: 11.5, color: "#B45309", marginTop: 6 }}>Highlighted placeholders are empty on this sample; on a real quote they fill from its KYC and lines.</div>
        )}
      </div>
    </div>
  );
}

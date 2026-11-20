// Where billing data lives: usage records and final invoices.
// Cloud: the billing_usage and billing_invoices tables
// (supabase/commercial_phase_c_v1.sql), read and written directly, outside the
// app's in-memory sync. Offline / local mode: the browser's localStorage, so
// the Billing screen works the same in development.
import { supabase, isSupabaseConfigured } from "../supabase";

const LS_KEY = "smartcrm_billing";
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch { return {}; } };
const writeLocal = (d) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* storage full or blocked */ } };

const USAGE_MAP = { id: "id", quoteId: "quote_id", accountId: "account_id", lineCode: "line_code", period: "period", quantity: "quantity", externalRef: "external_ref", source: "source", status: "status", correctsId: "corrects_id", note: "note", enteredBy: "entered_by", enteredAt: "entered_at", approvedBy: "approved_by", approvedAt: "approved_at", voidedBy: "voided_by", voidedAt: "voided_at" };
const INVOICE_MAP = { id: "id", invoiceNo: "invoice_no", type: "type", status: "status", quoteId: "quote_id", agreementNo: "agreement_no", accountId: "account_id", customer: "customer", period: "period", cycle: "cycle", currency: "currency", lines: "lines", taxable: "taxable", gstPct: "gst_pct", cgst: "cgst", sgst: "sgst", igst: "igst", gst: "gst", total: "total", creditOf: "credit_of", reason: "reason", collectionId: "collection_id", finalisedBy: "finalised_by", finalisedAt: "finalised_at" };
const TIMESTAMPS = new Set(["entered_at", "approved_at", "voided_at", "finalised_at"]);
const toDb = (obj, map) => Object.fromEntries(Object.entries(map).filter(([k]) => obj[k] !== undefined).map(([k, col]) => [col, TIMESTAMPS.has(col) && !obj[k] ? null : obj[k]]));
const fromDb = (row, map) => Object.fromEntries(Object.entries(map).map(([k, col]) => [k, row[col] ?? (col === "lines" ? [] : "")]));

export const billingIsCloud = () => isSupabaseConfigured;

/** Everything the Billing screen needs: { usage, invoices, error }. */
export async function loadBilling() {
  if (!isSupabaseConfigured) { const d = readLocal(); return { usage: d.usage || [], invoices: d.invoices || [], error: "" }; }
  const [u, i] = await Promise.all([
    supabase.from("billing_usage").select("*").order("entered_at", { ascending: true }).limit(5000),
    supabase.from("billing_invoices").select("*").order("finalised_at", { ascending: false }).limit(2000),
  ]);
  const error = u.error?.message || i.error?.message || "";
  return {
    usage: (u.data || []).map((r) => ({ ...fromDb(r, USAGE_MAP), quantity: Number(r.quantity) || 0 })),
    invoices: (i.data || []).map((r) => { const x = fromDb(r, INVOICE_MAP); for (const k of ["taxable", "gstPct", "cgst", "sgst", "igst", "gst", "total"]) x[k] = Number(x[k]) || 0; return x; }),
    error,
  };
}

/** Insert or update usage records. Returns { error }. */
export async function saveUsage(records) {
  const list = (records || []).filter(Boolean);
  if (!list.length) return { error: "" };
  if (!isSupabaseConfigured) {
    const d = readLocal(); const byId = new Map((d.usage || []).map((r) => [r.id, r]));
    list.forEach((r) => byId.set(r.id, r));
    writeLocal({ ...d, usage: [...byId.values()] });
    return { error: "" };
  }
  const { error } = await supabase.from("billing_usage").upsert(list.map((r) => toDb(r, USAGE_MAP)), { onConflict: "id" });
  return { error: error ? (/duplicate|unique/i.test(error.message) ? "That reference is already recorded for this component and month (duplicate)." : error.message) : "" };
}

/** Store a final invoice or credit note. Insert only: an invoice that exists is never overwritten. Returns { error }. */
export async function saveInvoice(invoice) {
  if (!isSupabaseConfigured) {
    const d = readLocal();
    if ((d.invoices || []).some((x) => x.id === invoice.id)) return { error: `${invoice.invoiceNo} already exists.` };
    writeLocal({ ...d, invoices: [invoice, ...(d.invoices || [])] });
    return { error: "" };
  }
  const { error } = await supabase.from("billing_invoices").insert(toDb(invoice, INVOICE_MAP));
  return { error: error ? (/duplicate|unique/i.test(error.message) ? `${invoice.invoiceNo} already exists: this period is already invoiced.` : error.message) : "" };
}

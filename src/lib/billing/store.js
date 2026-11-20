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

// ── Billing plans (billing_plans; versions, never deleted) ─────────────
const PLAN_MAP = { id: "id", planNo: "plan_no", version: "version", status: "status", accountId: "account_id", contractId: "contract_id", quoteId: "quote_id",
  supersedesId: "supersedes_id", legalEntity: "legal_entity", currency: "currency", effectiveFrom: "effective_from", effectiveTo: "effective_to", terms: "terms",
  reason: "reason", createdBy: "created_by", createdAt: "created_at", submittedBy: "submitted_by", submittedAt: "submitted_at", approvedBy: "approved_by",
  approvedAt: "approved_at", decisionNote: "decision_note", approvalRoute: "approval_route" };
const PLAN_NULLABLE = new Set(["contract_id", "quote_id", "supersedes_id", "effective_from", "effective_to", "created_at", "submitted_at", "approved_at", "account_id"]);
const planToDb = (p) => Object.fromEntries(Object.entries(toDb(p, PLAN_MAP)).map(([k, v]) => [k, PLAN_NULLABLE.has(k) && (v === "" || v == null) ? null : v]));
const planFromDb = (r) => { const p = fromDb(r, PLAN_MAP); p.version = Number(p.version) || 1; p.terms = r.terms || {}; return p; };
const missingTable = (msg) => /does not exist|relation|function .* not found|schema cache/i.test(String(msg || ""));

/** Every plan version this user may see: { plans, error }. Before the migration: none. */
export async function loadPlans() {
  if (!isSupabaseConfigured) return { plans: readLocal().plans || [], error: "" };
  const { data, error } = await supabase.from("billing_plans").select("*").order("plan_no").order("version").limit(5000);
  if (error) return { plans: [], error: missingTable(error.message) ? "" : error.message };
  return { plans: (data || []).map(planFromDb), error: "" };
}

/** Insert or update plan versions (drafts, submissions, version 1). Returns { error }. */
export async function savePlans(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return { error: "" };
  if (!isSupabaseConfigured) {
    const d = readLocal(); const byId = new Map((d.plans || []).map((p) => [p.id, p]));
    list.forEach((p) => byId.set(p.id, p));
    writeLocal({ ...d, plans: [...byId.values()] });
    return { error: "" };
  }
  const { error } = await supabase.from("billing_plans").upsert(list.map(planToDb), { onConflict: "id" });
  return { error: error ? (missingTable(error.message) ? "Billing plans need the billing database update (Phase 2)." : /row-level security/i.test(error.message) ? "You cannot change this plan." : error.message) : "" };
}

/** Approve or send back a version (atomic, in the database). localRows: what to write offline. Returns { error }. */
export async function decidePlan(id, decision, note, localRows = []) {
  if (!isSupabaseConfigured) return savePlans(localRows);
  const { error } = await supabase.rpc("decide_billing_plan", { p_id: id, p_decision: decision, p_note: note || null });
  return { error: error ? (missingTable(error.message) ? "Approving needs the billing database update (Phase 2)." : error.message) : "" };
}

// ── Legal-entity verification (billing_entity_checks; insert only) ─────
// Finance verifies an entity's details; a check records a fingerprint of the
// details it saw, so any later change shows the entity as unverified again.
const CHECK_MAP = { id: "id", entityId: "entity_id", fingerprint: "fingerprint", note: "note", by: "checked_by", at: "checked_at" };

/** All entity checks: { checks, error }. A missing table (migration not applied yet) reads as none. */
export async function loadEntityChecks() {
  if (!isSupabaseConfigured) return { checks: readLocal().entityChecks || [], error: "" };
  const { data, error } = await supabase.from("billing_entity_checks").select("*").order("checked_at", { ascending: false }).limit(1000);
  if (error) return { checks: [], error: /does not exist|relation/i.test(error.message) ? "" : error.message };
  return { checks: (data || []).map((r) => fromDb(r, CHECK_MAP)), error: "" };
}

/** Record a verification. Returns { error }. */
export async function saveEntityCheck(check) {
  if (!isSupabaseConfigured) {
    const d = readLocal();
    writeLocal({ ...d, entityChecks: [check, ...(d.entityChecks || [])] });
    return { error: "" };
  }
  const { error } = await supabase.from("billing_entity_checks").insert({ ...toDb(check, CHECK_MAP), checked_at: check.at || new Date().toISOString() });
  return { error: error ? (/does not exist|relation/i.test(error.message) ? "Verification needs the billing database update (Phase 1 migration)." : error.message) : "" };
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

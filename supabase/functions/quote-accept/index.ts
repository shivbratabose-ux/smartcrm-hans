// Edge Function: quote-accept
// -----------------------------------------------------------------------------
// The public half of the quote-accept flow. Customers reach
// #/quote-accept/<token> from the email link or the QR on the printed PDF —
// WITHOUT a CRM login. The SPA's public page calls this function; the
// quotations table itself stays closed to anonymous reads.
//
// Auth model — the TOKEN is the credential:
//   - The caller is an anonymous customer; there is no CRM profile to check.
//     The request still carries the project anon key as the Bearer token
//     (Supabase's default verify_jwt), which proves nothing about identity —
//     by design. What authorises the action is knowledge of `accept_token`,
//     an unguessable ~244-bit capability minted per quotation
//     (quote_accept_token_v1.sql).
//   - Lookups happen server-side with the service role. Misses return a
//     GENERIC "not found" — never a hint whether a token was close.
//   - The response is a SANITISED summary: no owner, margins, approval
//     notes, internal ids of other records, or anything else a customer
//     shouldn't see.
//
// Actions (POST JSON):
//   { token, action: "view" }
//   { token, action: "accept",  name, designation?, kyc: { legalName, pan, gstin, address } }
//     KYC is required on accept (14 Nov 2026 flow: the customer confirms and
//     returns KYC). gstin may be "UNREGISTERED". Saved onto the quote's
//     legal_name / pan / gstin / billing_address_snapshot.
//   { token, action: "changes", name?, comment }
//   { token: <billToken>, action: "bill-view" }
//   { token: <billToken>, action: "bill-confirm", name, designation? }
//     The customer confirms the bill, ULA and Agreement ("deemed signed").
//     The token is handover.billToken, minted when Accounts raises the bill.
//     Confirming creates the implementation project (or links a won deal's
//     project) and alerts the delivery lead, the sales owner and Accounts.
//
// State rules:
//   - view    : any status; expired/superseded/accepted states are reported
//               so the page can show the right terminal banner.
//   - accept  : only from "Sent" (or "Under Review"), not expired, not
//               superseded. Already-Accepted returns ok (idempotent).
//   - changes : same gate as accept; records the comment and flips the
//               quote to "Under Review".
//
// Side effects on accept/changes: change_log entry attributed to the
// customer, and an activity for the quote owner so the rep gets pinged.
// Contract creation stays a rep-side action in the app — a customer click
// should never mint contracts on its own.
//
// Deployment:
//   supabase functions deploy quote-accept

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  handoverOf, quoteAmounts, scopeLines, kycOf, resolveDocuments, docContext, fillTemplate,
  projectFromQuote, accountsIds, HOSTING_LABEL, GST_UNREGISTERED,
} from "../_shared/handoverCore.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const todayISO = () => {
  // IST calendar day — quotes carry Indian business dates. UTC would roll
  // the expiry check back a day between 00:00 and 05:30 IST.
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
};

// ── KYC rules: keep in step with src/lib/quotation/handover.js ──
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GST_UNREGISTERED = "UNREGISTERED";
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
function readKyc(raw: any) {
  const k = {
    legalName: clean(raw?.legalName, 200).replace(/\s+/g, " "),
    pan: clean(raw?.pan, 20).toUpperCase().replace(/\s+/g, ""),
    gstin: clean(raw?.gstin, 20).toUpperCase().replace(/\s+/g, ""),
    address: clean(raw?.address, 600),
  };
  const problems: string[] = [];
  if (k.legalName.length < 3) problems.push("legal name");
  if (!PAN_RE.test(k.pan)) problems.push("PAN (like ABCDE1234F)");
  if (k.gstin !== GST_UNREGISTERED) {
    if (!GSTIN_RE.test(k.gstin)) problems.push("GSTIN (15 characters) or tick \"not registered under GST\"");
    else if (PAN_RE.test(k.pan) && k.gstin.slice(2, 12) !== k.pan) problems.push("GSTIN that matches the PAN");
  }
  if (k.address.length < 10) problems.push("registered address");
  return { k, problems };
}

// The only fields a customer may see.
function sanitise(q: any, accountName: string, contactName: string) {
  const expired = !!(q.expiry_date && q.expiry_date < todayISO() && q.status !== "Accepted");
  return {
    quoteNo: q.quote_no || q.id,
    title: q.title || "",
    accountName,
    contactName,
    status: q.status,
    expired,
    superseded: !!q.supersedes_quote_id && q.status === "Revised",
    sentDate: q.sent_date || "",
    expiryDate: q.expiry_date || "",
    validity: q.validity || "",
    currency: q.currency || "INR",
    subtotal: q.subtotal ?? null,
    taxType: q.tax_type || "",
    taxAmount: q.tax_amount ?? null,
    discount: q.discount ?? null,
    total: q.total ?? null,
    items: Array.isArray(q.items)
      ? q.items.map((it: any) => ({
          name: it.name || it.moduleName || it.description || "",
          qty: it.qty ?? it.quantity ?? 1,
          unit: it.unit || "",
          price: it.price ?? it.unitPrice ?? null,
          amount: it.amount ?? it.total ?? null,
        }))
      : [],
    terms: q.terms || "",
    acceptedDate: q.accepted_date || "",
    hosting: q.hosting || "",
    kyc: { legalName: q.legal_name || "", pan: q.pan || "", gstin: q.gstin || "", address: q.billing_address_snapshot || "" },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const token = String(body?.token || "").trim();
  const action = String(body?.action || "view");
  // Tokens are 64 hex chars (backfill) or 48 (client-minted). Reject junk
  // early so the DB never sees probe traffic shapes.
  if (!/^[a-f0-9]{32,80}$/i.test(token)) return json({ error: "Quote not found" }, 404);
  if (!["view", "accept", "changes", "bill-view", "bill-confirm"].includes(action)) return json({ error: "Unknown action" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action.startsWith("bill-")) return billStep(admin, token, action, body);

  const { data: q, error: qErr } = await admin
    .from("quotations")
    .select("id, quote_no, title, account_id, contact_id, owner, status, items, subtotal, tax_type, tax_amount, discount, total, currency, validity, sent_date, expiry_date, accepted_date, supersedes_quote_id, is_final, terms, change_log, hosting, legal_name, pan, gstin, billing_address_snapshot")
    .eq("accept_token", token)
    .eq("is_deleted", false)
    .maybeSingle();
  if (qErr) return json({ error: "Lookup failed" }, 500);
  if (!q) return json({ error: "Quote not found" }, 404);

  const [{ data: acc }, { data: con }] = await Promise.all([
    q.account_id
      ? admin.from("accounts").select("name").eq("id", q.account_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    q.contact_id
      ? admin.from("contacts").select("name").eq("id", q.contact_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);
  const accountName = acc?.name || "";
  const contactName = con?.name || "";

  if (action === "view") return json({ ok: true, quote: sanitise(q, accountName, contactName) });

  // ── Mutations: accept / changes ──
  const summary = sanitise(q, accountName, contactName);
  if (q.status === "Accepted") {
    // Idempotent: a double-click or refresh after accepting is fine.
    return json({ ok: true, alreadyAccepted: true, quote: summary });
  }
  if (summary.expired) return json({ error: "This quote has expired. Please ask your account manager for a fresh one.", quote: summary }, 409);
  if (summary.superseded) return json({ error: "This quote has been revised. Please use the link to the latest version.", quote: summary }, 409);
  if (!["Sent", "Under Review"].includes(q.status)) {
    return json({ error: "This quote is not open for a response.", quote: summary }, 409);
  }

  const customer = String(body?.name || "").slice(0, 120).trim();
  const nowIso = new Date().toISOString();
  const changeLog = Array.isArray(q.change_log) ? q.change_log : [];

  if (action === "accept") {
    if (!customer) return json({ error: "Please enter your name." }, 400);
    const { k, problems } = readKyc(body?.kyc);
    if (problems.length) return json({ error: `Please check: ${problems.join(", ")}.`, quote: summary }, 400);
    const entry = {
      id: crypto.randomUUID().slice(0, 8),
      at: nowIso,
      by: "customer",
      field: "status", from: q.status, to: "Accepted",
      note: `Accepted via public link${customer ? ` by ${customer}` : ""}${body?.designation ? ` (${String(body.designation).slice(0, 80)})` : ""}`,
    };
    const kycEntry = {
      id: crypto.randomUUID().slice(0, 8),
      at: nowIso,
      by: "customer",
      field: "kyc", from: "", to: "submitted",
      note: `KYC from customer: ${k.legalName} · PAN ${k.pan} · GSTIN ${k.gstin === GST_UNREGISTERED ? "not registered" : k.gstin}`,
    };
    // Accepting is NOT "FINAL": Sales marks FINAL in the CRM after checking
    // approval, hosting and KYC (that is what tells Accounts to bill).
    const { error: uErr } = await admin.from("quotations").update({
      status: "Accepted",
      accepted_date: todayISO(),
      legal_name: k.legalName,
      pan: k.pan,
      gstin: k.gstin,
      billing_address_snapshot: k.address,
      change_log: [...changeLog, entry, kycEntry],
    }).eq("id", q.id).eq("accept_token", token);
    if (uErr) return json({ error: "Could not record the acceptance. Please try again." }, 500);

    // Ping the owner. Best-effort: acceptance stands even if this insert fails.
    if (q.owner) {
      await admin.from("activities").insert({
        id: `act${crypto.randomUUID().slice(0, 8)}`,
        title: `Quote ${q.quote_no || q.id} accepted by customer${customer ? ` (${customer})` : ""}`,
        type: "Task", status: "Planned",
        date: todayISO(), owner: q.owner, account_id: q.account_id || null,
        notes: "Accepted via the public quote link, with KYC. Check hosting and KYC on the quote, then Mark as FINAL so Accounts can raise the bill.",
      });
    }
    return json({ ok: true, accepted: true, quote: { ...summary, status: "Accepted", acceptedDate: todayISO() } });
  }

  // action === "changes"
  const comment = String(body?.comment || "").slice(0, 2000).trim();
  if (!comment) return json({ error: "Please describe the change you need." }, 400);
  const entry = {
    id: crypto.randomUUID().slice(0, 8),
    at: nowIso,
    by: "customer",
    field: "status", from: q.status, to: "Under Review",
    note: `Change requested via public link${customer ? ` by ${customer}` : ""}: ${comment}`,
  };
  const { error: cErr } = await admin.from("quotations").update({
    status: "Under Review",
    change_log: [...changeLog, entry],
  }).eq("id", q.id).eq("accept_token", token);
  if (cErr) return json({ error: "Could not record your request. Please try again." }, 500);

  if (q.owner) {
    await admin.from("activities").insert({
      id: `act${crypto.randomUUID().slice(0, 8)}`,
      title: `Quote ${q.quote_no || q.id}: customer requested changes`,
      type: "Task", status: "Planned",
      date: todayISO(), owner: q.owner, account_id: q.account_id || null,
      notes: `${customer ? `${customer}: ` : ""}${comment}`,
    });
  }
  return json({ ok: true, changesRequested: true, quote: { ...summary, status: "Under Review" } });
});


// ═══ Bill confirmation (customer) ═══════════════════════════════════════
const quoteOf = (r: any) => ({
  id: r.id, quoteNo: r.quote_no, title: r.title, version: r.version, owner: r.owner,
  accountId: r.account_id, oppId: r.opp_id, contractId: r.contract_id, contactId: r.contact_id,
  createdDate: r.created_date, status: r.status, hosting: r.hosting, handover: r.handover || {},
  legalName: r.legal_name, pan: r.pan, gstin: r.gstin, billingAddressSnapshot: r.billing_address_snapshot,
  paymentTerms: r.payment_terms, product: r.product, productSelection: r.product_selection,
  items: Array.isArray(r.items) ? r.items : [], total: r.total, taxAmount: r.tax_amount, hans: r.hans, currency: r.currency,
});

async function billStep(admin: any, token: string, action: string, body: any) {
  const { data: rows, error } = await admin.from("quotations").select("*")
    .eq("is_deleted", false).filter("handover->>billToken", "eq", token).limit(1);
  if (error) return json({ error: "Lookup failed" }, 500);
  const row = rows?.[0];
  if (!row) return json({ error: "Bill not found" }, 404);
  const q = quoteOf(row);
  const h = handoverOf(q);
  const [{ data: acc }, { data: settings }, { data: bill }] = await Promise.all([
    q.accountId ? admin.from("accounts").select("name").eq("id", q.accountId).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("app_settings").select("masters, catalog").eq("scope", "org").maybeSingle(),
    h.billId ? admin.from("collections").select("invoice_no, invoice_date, due_date, billed_amount, gst_amount, net_payable, currency").eq("id", h.billId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const docs = resolveDocuments(settings?.masters);
  const ctx = docContext(q, { today: todayISO() });
  const k = kycOf(q);
  const a = quoteAmounts(q);
  const summary = {
    quoteNo: q.quoteNo || q.id, title: q.title || "", accountName: acc?.name || "",
    billNo: bill?.invoice_no || h.billNo || "", billDate: bill?.invoice_date || "", dueDate: bill?.due_date || "",
    taxable: bill?.billed_amount ?? a.taxable, gst: bill?.gst_amount ?? a.gst, total: bill?.net_payable ?? a.total,
    currency: bill?.currency || q.currency || "INR",
    customer: { legalName: k.legalName, pan: k.pan, gstin: k.gstin === GST_UNREGISTERED ? "Not registered under GST" : k.gstin, address: k.address },
    hosting: HOSTING_LABEL[q.hosting] || q.hosting || "",
    lines: scopeLines(q),
    documents: docs.filter((d: any) => d.body.trim()).map((d: any) => ({ title: d.title, html: fillTemplate(d.body, ctx).html })),
    confirmed: !!h.confirmedAt, confirmedAt: h.confirmedAt || "", confirmedName: h.confirmedName || "",
  };
  if (action === "bill-view") return json({ ok: true, bill: summary });

  // ── bill-confirm ──
  if (h.confirmedAt) return json({ ok: true, alreadyConfirmed: true, bill: summary });
  const name = String(body?.name || "").slice(0, 120).trim();
  const designation = String(body?.designation || "").slice(0, 80).trim();
  if (!name) return json({ error: "Please enter your name." }, 400);
  const at = new Date().toISOString();
  const today = todayISO();

  // Implementation project: a won deal's project if there is one, else a new one.
  const productIds = [...new Set([...(Array.isArray(q.productSelection) ? q.productSelection.map((x: any) => x?.productId) : []), q.product].filter(Boolean))];
  const catalog = Array.isArray(settings?.catalog) ? settings.catalog : [];
  const leadUser = catalog.find((c: any) => productIds.includes(c?.id) && c?.lineManagerId)?.lineManagerId || "";
  let project: any = null, reused = false;
  if (q.oppId) {
    const { data: ex } = await admin.from("projects").select("id, project_no").eq("opp_id", q.oppId).eq("is_deleted", false).limit(1);
    if (ex?.[0]) { project = { id: ex[0].id, projectNo: ex[0].project_no }; reused = true; }
  }
  if (!project) {
    const year = new Date().getUTCFullYear();
    const { data: n } = await admin.rpc("allocate_doc_no", { p_kind: `project:${year}` });
    const p = projectFromQuote(q, { today, projectNo: `PRJ-${year}-${String(n || Date.now() % 1000).padStart(3, "0")}`, leadUserId: leadUser, products: productIds, accountName: acc?.name || "" });
    const { error: pErr } = await admin.from("projects").insert({
      id: p.id, project_no: p.projectNo, name: p.name, account_id: p.accountId || null, opp_id: p.oppId || null,
      contract_id: p.contractId || null, owner: p.owner || null, products: p.products, status: p.status, progress: 0,
      start_date: today, value: p.value, scope: p.scope, deliverables: p.deliverables, risks: "", notes: p.notes,
      milestones: [], team: p.team, created_date: today, is_deleted: false,
    });
    if (pErr) console.error("bill-confirm project insert", pErr.message);
    else project = { id: p.id, projectNo: p.projectNo };
  }

  const entry = {
    id: crypto.randomUUID().slice(0, 8), at, by: "customer", field: "handover", from: "Billed", to: "Confirmed",
    note: `Bill, ULA and Agreement confirmed online by ${name}${designation ? ` (${designation})` : ""} — deemed signed.${project ? ` Implementation: ${project.projectNo}${reused ? " (existing project for this deal)" : " created"}.` : ""}`,
  };
  const handover = { ...h, confirmedAt: at, confirmedBy: "customer", confirmedName: name, confirmedDesignation: designation,
    ...(project ? { projectId: project.id, projectNo: project.projectNo, projectAt: at } : {}) };
  const { error: uErr } = await admin.from("quotations").update({
    handover, change_log: [...(Array.isArray(row.change_log) ? row.change_log : []), entry],
  }).eq("id", q.id).filter("handover->>billToken", "eq", token);
  if (uErr) return json({ error: "Could not record your confirmation. Please try again." }, 500);

  // Alerts: delivery lead, sales owner, Accounts — a task and a bell each.
  const { data: users } = await admin.from("users").select("id, role, active, status");
  const qc = settings?.masters?.quotation?.quoteConfig || {};
  const told = [...new Set([leadUser, q.owner, ...accountsIds(qc, users || [])].filter(Boolean))];
  const title = `Start implementation: ${acc?.name || q.title || q.quoteNo}`;
  const text = `${name} confirmed bill ${summary.billNo} for ${q.quoteNo} online (deemed signed). Project ${project?.projectNo || "—"}. Hosting: ${summary.hosting || "—"}. Activate exactly what was quoted: ${summary.lines.join("; ") || "see the quote"}.`;
  if (told.length) {
    await admin.from("activities").insert(told.map((uid) => ({
      id: `act${crypto.randomUUID().slice(0, 8)}`, title, type: "Follow-up", status: "Planned", date: today,
      owner: uid, account_id: q.accountId || null, opp_id: q.oppId || null, notes: text,
    })));
    await admin.from("updates").insert(told.map((uid) => ({
      id: `upd_${crypto.randomUUID().slice(0, 12)}`, update_id: `NTF-${Date.now().toString(36).toUpperCase()}`,
      title, description: text, category: "Announcement", priority: "High", tags: ["notification"],
      created_by: q.owner || "", created_at: at, updated_at: at, recipient_mode: "users",
      recipient_team_ids: [], recipient_user_ids: [uid], tagged_user_ids: [], attachments: [], read_status: {}, edit_history: [], archived: false, is_deleted: false,
    })));
  }
  return json({ ok: true, confirmed: true, bill: { ...summary, confirmed: true, confirmedAt: at, confirmedName: name } });
}

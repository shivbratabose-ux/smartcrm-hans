// Edge Function: quote-handover
// -----------------------------------------------------------------------------
// The e-mails of the Quote → Accounts flow (approved 14 Nov 2026):
//
//   { action: "notify-final", quoteId }  → each Accounts person: the FINAL
//                                           quote's pack (KYC, hosting, amounts,
//                                           lines) + a link to the CRM.
//   { action: "send-bill",    quoteId }  → the customer's billing contact: the
//                                           bill and the online confirm link
//                                           (bill, ULA, Agreement, "I confirm").
//
// Caller: a signed-in, active CRM user who may act on the quote (its owner,
// a top-level role, Finance, or someone on the quote desk in Masters).
// Sending: Microsoft 365 via _shared/graphMail.ts. Until IT sets that up
// (EM_GRAPH_* secrets) the function answers { notConfigured: true } with the
// would-be recipients, and the CRM shows the link to share by hand.
//
// Deployment:  supabase functions deploy quote-handover

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mailConfigured, sendMail, senderAddress } from "../_shared/graphMail.ts";
import {
  accountsIds, accountsPackEmail, customerBillPackEmail, customerBillEmail, billConfirmLink,
  resolveDocuments, handoverOf, SMART_CRM_URL,
} from "../_shared/handoverCore.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const GLOBAL = ["admin", "md", "director", "vp_sales_mkt"];

// DB row → the camelCase fields handoverCore reads.
function quoteOf(r: any) {
  return {
    id: r.id, quoteNo: r.quote_no, title: r.title, version: r.version, owner: r.owner,
    accountId: r.account_id, contactId: r.contact_id, createdDate: r.created_date,
    status: r.status, isFinal: r.is_final, hosting: r.hosting, handover: r.handover || {},
    legalName: r.legal_name, pan: r.pan, gstin: r.gstin, billingAddressSnapshot: r.billing_address_snapshot,
    billingContactName: r.billing_contact_name, billingContactEmail: r.billing_contact_email,
    financeContactEmail: r.finance_contact_email, paymentTerms: r.payment_terms, poNumber: r.po_number,
    items: Array.isArray(r.items) ? r.items : [], total: r.total, taxAmount: r.tax_amount, hans: r.hans,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = String(body?.action || "");
  const quoteId = String(body?.quoteId || "").slice(0, 80);
  if (!["notify-final", "send-bill"].includes(action) || !quoteId) return json({ error: "Unknown request" }, 400);

  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const crmUrl = (Deno.env.get("PUBLIC_APP_URL") || SMART_CRM_URL).replace(/\/+$/, "");

  // 1. The caller must be an active CRM user.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Not signed in" }, 401);
  const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: who, error: wErr } = await asCaller.auth.getUser();
  if (wErr || !who?.user) return json({ error: "Not signed in" }, 401);
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me } = await admin.from("users").select("id, name, email, role, active").eq("auth_user_id", who.user.id).maybeSingle();
  if (!me || me.active === false) return json({ error: "No active CRM profile" }, 403);

  // 2. The quote, the org settings and the people.
  const [{ data: row }, { data: settings }, { data: users }] = await Promise.all([
    admin.from("quotations").select("*").eq("id", quoteId).eq("is_deleted", false).maybeSingle(),
    admin.from("app_settings").select("masters").eq("scope", "org").maybeSingle(),
    admin.from("users").select("id, name, email, role, active, status"),
  ]);
  if (!row) return json({ error: "Quote not found" }, 404);
  const q = quoteOf(row);
  const qc = settings?.masters?.quotation?.quoteConfig || {};
  const desk = [...(qc.approverIds || []), ...(qc.accountsUserIds || [])];
  const allowed = q.owner === me.id || GLOBAL.includes(me.role) || me.role === "finance" || desk.includes(me.id);
  if (!allowed) return json({ error: "You can't act on this quote" }, 403);
  const docs = resolveDocuments(settings?.masters);
  const h = handoverOf(q);
  const people = (users || []).map((u: any) => ({ ...u, isDeleted: false }));

  let recipients: string[] = [];
  let mail: { subject: string; html: string };
  let extra: Record<string, unknown> = {};

  if (action === "notify-final") {
    if (!h.finalAt) return json({ error: "The quote is not FINAL yet", retry: true }, 409);
    const ids = accountsIds(qc, people);
    recipients = people.filter((u: any) => ids.includes(u.id) && /@/.test(u.email || "")).map((u: any) => u.email);
    const { data: acc } = q.accountId ? await admin.from("accounts").select("name").eq("id", q.accountId).maybeSingle() : { data: null } as any;
    const finalBy = people.find((u: any) => u.id === h.finalBy)?.name || "";
    mail = accountsPackEmail(q, { crmUrl: `${crmUrl}/#/quotations`, finalByName: finalBy, accountName: acc?.name || "", docs });
  } else {
    if (!h.billId || !h.billToken) return json({ error: "Raise the bill first", retry: true }, 409);
    let contactEmail = "", contactName = q.billingContactName || "";
    if (q.contactId) {
      const { data: c } = await admin.from("contacts").select("name, email").eq("id", q.contactId).maybeSingle();
      contactEmail = c?.email || ""; contactName = contactName || c?.name || "";
    }
    const to = customerBillEmail(q, contactEmail);
    if (!to) return json({ error: "The quote has no billing e-mail. Add the billing contact e-mail on the quote first." }, 400);
    recipients = [to];
    const { data: bill } = await admin.from("collections").select("invoice_no, net_payable, due_date").eq("id", h.billId).maybeSingle();
    const link = billConfirmLink(crmUrl, h.billToken);
    mail = customerBillPackEmail(q, { link, docs, contactName, bill: bill ? { invoiceNo: bill.invoice_no, netPayable: bill.net_payable, dueDate: bill.due_date } : null });
    extra = { link };
  }

  if (!recipients.length) return json({ ok: false, error: "Nobody to send to: set the Accounts team in Masters → Quotation Pricing → Config (with e-mail addresses)." }, 400);
  if (!mailConfigured()) return json({ ok: true, notConfigured: true, recipients, ...extra });

  const sent: string[] = [], failed: string[] = [];
  for (const to of recipients) {
    try {
      await sendMail({ to, subject: mail.subject, html: mail.html, replyTo: action === "send-bill" ? (me.email || undefined) : undefined });
      sent.push(to);
    } catch (e) { console.error("quote-handover send", to, String(e)); failed.push(to); }
  }

  // The CRM records the send on the quote (it is the quote's only writer, so
  // this function never races the app's own save).
  return json({ ok: failed.length === 0, sent, failed, from: senderAddress(), ...extra });
});

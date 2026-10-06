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
//   { token, action: "accept",  name?, designation? }
//   { token, action: "changes", name?, comment }
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
  if (!["view", "accept", "changes"].includes(action)) return json({ error: "Unknown action" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: q, error: qErr } = await admin
    .from("quotations")
    .select("id, quote_no, title, account_id, contact_id, owner, status, items, subtotal, tax_type, tax_amount, discount, total, currency, validity, sent_date, expiry_date, accepted_date, supersedes_quote_id, is_final, terms, change_log")
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
    const entry = {
      id: crypto.randomUUID().slice(0, 8),
      at: nowIso,
      by: "customer",
      field: "status", from: q.status, to: "Accepted",
      note: `Accepted via public link${customer ? ` by ${customer}` : ""}${body?.designation ? ` (${String(body.designation).slice(0, 80)})` : ""}`,
    };
    const { error: uErr } = await admin.from("quotations").update({
      status: "Accepted",
      accepted_date: todayISO(),
      is_final: true,
      change_log: [...changeLog, entry],
    }).eq("id", q.id).eq("accept_token", token);
    if (uErr) return json({ error: "Could not record the acceptance. Please try again." }, 500);

    // Ping the owner. Best-effort: acceptance stands even if this insert fails.
    if (q.owner) {
      await admin.from("activities").insert({
        id: `act${crypto.randomUUID().slice(0, 8)}`,
        title: `Quote ${q.quote_no || q.id} accepted by customer${customer ? ` (${customer})` : ""}`,
        type: "Task", status: "Planned",
        date: todayISO(), owner: q.owner, account_id: q.account_id || null,
        notes: "Accepted via the public quote link. Convert to contract from the Quotations page.",
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

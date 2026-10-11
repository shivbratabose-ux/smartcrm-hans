// Edge Function: lead-intake
// -----------------------------------------------------------------------------
// Receives website form submissions from the Hans website's Netlify forwarder
// (netlify/functions/submission-created.js) and turns them into SmartCRM leads.
//
// Wiring on the website (Netlify → Site configuration → Environment variables):
//   CRM_WEBHOOK_URL   = https://kiiykerktkvfkzlyqtza.supabase.co/functions/v1/lead-intake
//   CRM_WEBHOOK_TOKEN = <the same value as LEAD_INTAKE_TOKEN below>
// No website code changes: the forwarder already posts this JSON shape with
// "Authorization: Bearer <CRM_WEBHOOK_TOKEN>".
//
// Auth model — a shared secret, not a Supabase login:
//   - The forwarder is a server, not a CRM user, so this function is deployed
//     with `--no-verify-jwt` (the gateway would reject a non-JWT bearer) and
//     checks the bearer itself against LEAD_INTAKE_TOKEN, in constant time.
//   - Fails CLOSED: with no LEAD_INTAKE_TOKEN configured, every call is refused.
//   - Database work uses the service role; nothing from the database is
//     returned to the caller beyond the new lead's id / number.
//
// What it does (decisions live in ./logic.js, tested by scripts/test-lead-intake.mjs):
//   1. Idempotency: claims the Netlify submission id in lead_intake_log first.
//      A retry or double delivery returns the original outcome, never a 2nd lead.
//   2. Classifies: "Book a demo" → demo pipeline; partnership / tender / partner
//      / event forms → ordinary leads; support, general, newsletter and paper
//      downloads → logged and skipped (sales@ still gets Netlify's e-mail).
//   3. Repeat e-mail → updates the existing lead (campaign stays first touch)
//      and logs the enquiry. New e-mail → creates the lead with a #FL- number
//      from allocate_lead_id(), so it can never clash with app-created leads.
//   4. Assigns the owner AT INTAKE (the app's own routing runs in the browser,
//      which would leave an API lead unowned until someone opens SmartCRM):
//      existing lead owner → existing customer's account owner (by e-mail
//      domain) → product's Line Manager (Masters → Catalogue) →
//      INTAKE_DEFAULT_OWNER.
//   5. Creates a planned Call for the owner, due today: the first-response task.
//
// Secrets (supabase secrets set ...):
//   LEAD_INTAKE_TOKEN     required — long random string, shared with Netlify
//   INTAKE_DEFAULT_OWNER  optional — users.id that gets leads nothing else routes
//
// Deploy:
//   supabase functions deploy lead-intake --no-verify-jwt --project-ref kiiykerktkvfkzlyqtza

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  classify, matchProduct, emailDomain, isFreeMail,
  buildNewLead, buildRepeatPatch, buildActivity,
} from "./logic.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Constant-time string compare (length leak only).
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

const rid = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
// Escape LIKE wildcards so an address like first_last@x.com matches only itself.
const likeExact = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const expected = Deno.env.get("LEAD_INTAKE_TOKEN") || "";
  if (expected.length < 24) return json({ error: "Intake not configured" }, 503);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(bearer, expected)) return json({ error: "Unauthorized" }, 401);

  const raw = await req.text();
  if (raw.length > 64_000) return json({ error: "Payload too large" }, 413);
  let p: any;
  try { p = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1 ── Idempotency claim ────────────────────────────────────────────
  const sid = String(p?.netlify_submission_id || "").trim()
    || `nosid:${String(p?.form || "")}:${String(p?.email || "").toLowerCase()}:${String(p?.submitted_at || "")}`;
  const intentLabel = String(p?.fields?.intent || "");
  const { error: claimErr } = await admin.from("lead_intake_log").insert({
    submission_id: sid, form_name: p?.form || null, intent: intentLabel || null,
    email: String(p?.email || "").toLowerCase() || null, outcome: "processing",
  });
  if (claimErr) {
    if (claimErr.code === "23505") {
      const { data: prev } = await admin.from("lead_intake_log")
        .select("outcome, reason, lead_id").eq("submission_id", sid).maybeSingle();
      return json({ ok: true, duplicate: true, ...prev });
    }
    return json({ error: "Intake log unavailable" }, 500);
  }
  const finish = async (outcome: string, reason: string | null, leadId: string | null, status = 200, extra: any = {}) => {
    await admin.from("lead_intake_log").update({ outcome, reason, lead_id: leadId }).eq("submission_id", sid);
    return json({ ok: outcome !== "error", outcome, reason, leadId, ...extra }, status);
  };

  try {
    // 2 ── Classify ───────────────────────────────────────────────────
    const cls = classify(p);
    if (cls.kind === "skip") return await finish("skipped", cls.reason, null);

    const email = String(p.email).trim().toLowerCase();
    const now = new Date();

    // Catalogue (for product → Line Manager routing) lives in app_settings.
    const { data: settings } = await admin.from("app_settings").select("catalog").eq("scope", "org").maybeSingle();
    const product = cls.kind === "demo" ? matchProduct(p.product, settings?.catalog) : null;

    // 3 ── Repeat e-mail? ──────────────────────────────────────────────
    const { data: found } = await admin.from("leads")
      .select("id, lead_id, owner, account_id, contact_name, email, demo_status, marketing_consent, phone, website_lead_ref, preferred_time, visitor_timezone, campaign_name, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, first_referrer")
      .ilike("email", likeExact(email)).eq("is_deleted", false)
      .order("created_date", { ascending: true }).limit(1);
    const existing = found?.[0];

    if (existing) {
      const patch = buildRepeatPatch({ existing, p, cls, now });
      if (Object.keys(patch).length) {
        const { error } = await admin.from("leads").update(patch).eq("id", existing.id);
        if (error) throw new Error(`lead update: ${error.message}`);
      }
      await admin.from("activities").insert(buildActivity({ p, cls, lead: existing, product, repeat: true, id: rid("act"), now }));
      return await finish("updated", "Existing lead matched by e-mail.", existing.id, 200, { leadNumber: existing.lead_id });
    }

    // 4 ── Owner at intake ────────────────────────────────────────────
    const userExists = async (id?: string | null) => {
      if (!id) return false;
      const { data } = await admin.from("users").select("id").eq("id", id).maybeSingle();
      return !!data;
    };
    let owner: string | null = null, accountId: string | null = null, routedBy = "unrouted";
    const domain = emailDomain(email);
    if (domain && !isFreeMail(domain)) {
      const { data: cons } = await admin.from("contacts").select("account_id")
        .ilike("email", `%@${likeExact(domain)}`).eq("is_deleted", false).not("account_id", "is", null).limit(1);
      accountId = cons?.[0]?.account_id || null;
      if (!accountId) {
        const { data: accs } = await admin.from("accounts").select("id")
          .ilike("website", `%${likeExact(domain)}%`).eq("is_deleted", false).limit(2);
        if (accs?.length === 1) accountId = accs[0].id;
      }
      if (accountId) {
        const { data: acc } = await admin.from("accounts").select("owner").eq("id", accountId).maybeSingle();
        if (await userExists(acc?.owner)) { owner = acc!.owner; routedBy = "existing customer's account owner"; }
      }
    }
    if (!owner && product?.lineManagerId && await userExists(product.lineManagerId)) {
      owner = product.lineManagerId; routedBy = `${product.name} Line Manager`;
    }
    const fallback = Deno.env.get("INTAKE_DEFAULT_OWNER");
    if (!owner && await userExists(fallback)) { owner = fallback!; routedBy = "default intake owner"; }

    // 5 ── Create ─────────────────────────────────────────────────────
    const { data: leadNo, error: noErr } = await admin.rpc("allocate_lead_id");
    if (noErr || !leadNo) throw new Error(`allocate_lead_id: ${noErr?.message || "no number"}`);
    const row = buildNewLead({ p, cls, product, owner, accountId, id: rid("ld"), leadId: leadNo, now });
    const { error: insErr } = await admin.from("leads").insert(row);
    if (insErr) throw new Error(`lead insert: ${insErr.message}`);
    await admin.from("activities").insert(buildActivity({ p, cls, lead: row, product, repeat: false, id: rid("act"), now }));
    return await finish("created", `Routed to: ${routedBy}.`, row.id, 200, { leadNumber: leadNo });
  } catch (e: any) {
    // Netlify keeps the submission and sales@ has the e-mail, so nothing is lost.
    return await finish("error", String(e?.message || e).slice(0, 500), null, 500);
  }
});

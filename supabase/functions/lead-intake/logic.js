// Pure decision logic for the lead-intake edge function.
//
// No Deno or Supabase APIs here, so the same file is imported by the edge
// function (index.ts) and by the Node test suite (scripts/test-lead-intake.mjs)
// — the tests exercise the real rules, not a copy of them.
//
// Input shape is exactly what the website's Netlify forwarder posts
// (Hans Website content update and redesign/netlify/functions/submission-created.js):
//   { form, lead_source, submitted_at, name, email, company, phone, product,
//     lead_ref, marketing_consent, campaign: { utm_*, landing_page, referrer },
//     page, fields: { intent, topic, note, preferred_time, timezone, ... },
//     netlify_submission_id }

export const normKey = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── Which submissions become leads ─────────────────────────────────────
// The Contact page's demo-request form carries an `intent` LABEL (not a key).
// Only "Book a demo" enters the demo pipeline; partnership and tender
// enquiries become ordinary leads; support and general questions are not
// sales leads (Netlify still e-mails every submission to sales@).
const DEMO_INTENT = "bookademo";
const LEAD_INTENTS = { partnership: "Partnership enquiry", tenderorrfp: "Tender / RFP enquiry" };
const SKIP_INTENTS = {
  customersupport: "Support request: handled by the support desk, not the sales pipeline.",
  somethingelse: "General enquiry (press, events, careers): not a sales lead.",
};
const SKIP_FORMS = {
  newsletter: "Newsletter sign-up: marketing contact, not a sales lead.",
  "paper-download": "Research paper download: marketing contact, not a sales lead.",
};

export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());

export function classify(p) {
  if (!p || typeof p !== "object") return { kind: "skip", reason: "Empty payload." };
  if (!isValidEmail(p.email)) return { kind: "skip", reason: "No valid e-mail address." };
  const form = String(p.form || "");
  if (SKIP_FORMS[form]) return { kind: "skip", reason: SKIP_FORMS[form] };
  if (form === "partner-enquiry") return { kind: "lead", source: "Website", label: "Partner enquiry" };
  if (form === "event-meeting") return { kind: "lead", source: "Events", label: "Event meeting request" };
  if (form !== "demo-request") return { kind: "skip", reason: `Unknown form "${form}".` };

  const intent = normKey(p.fields?.intent);
  if (intent === DEMO_INTENT || (!intent && String(p.product || "").trim()))
    return { kind: "demo", source: "Website", label: "Website demo request" };
  if (SKIP_INTENTS[intent]) return { kind: "skip", reason: SKIP_INTENTS[intent] };
  if (LEAD_INTENTS[intent]) return { kind: "lead", source: "Website", label: LEAD_INTENTS[intent] };
  // Unrecognised intent: keep it as a lead rather than lose a possible sale.
  return { kind: "lead", source: "Website", label: `Website enquiry (${p.fields?.intent || "no intent"})` };
}

// ── Product matching ───────────────────────────────────────────────────
// Website names differ from catalogue names: "WiseDOX" vs "WiseDox",
// "E-Annex Ultra" vs "E-ANNEX", "AMS" vs "AMS Ocean", "CRM Expert" vs the
// renamed "SmartCRM". Match exact (case/punctuation-insensitive) on id or
// name, then aliases, then a prefix either way.
const ALIASES = { eannexultra: "eannex", crmexpert: "smartcrm" };

export function matchProduct(raw, catalog) {
  const k = normKey(raw);
  if (!k || k === "notsureyet") return null;
  const list = Array.isArray(catalog) ? catalog : [];
  const keysOf = (p) => [normKey(p.id), normKey(p.name)].filter(Boolean);
  const exact = (key) => list.find(p => keysOf(p).includes(key));
  const hit = exact(k) || (ALIASES[k] && exact(ALIASES[k]));
  if (hit) return hit;
  return list.find(p => keysOf(p).some(c => c.length >= 3 && k.length >= 3 && (c.startsWith(k) || k.startsWith(c)))) || null;
}

// ── E-mail domain ──────────────────────────────────────────────────────
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "hotmail.com",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
  "rediffmail.com", "zoho.com", "zohomail.in", "gmx.com", "mail.com", "yandex.com"]);

export const emailDomain = (e) => String(e || "").trim().toLowerCase().split("@")[1] || "";
export const isFreeMail = (domain) => FREE_MAIL.has(String(domain || "").toLowerCase());

// The leads table requires a company. Prefer what the visitor typed (stored
// ALL CAPS, the app's policy for company names), else the corporate domain,
// else the person's name.
export function companyFor(p) {
  const typed = String(p.company || "").trim();
  if (typed) return typed.toUpperCase();
  const d = emailDomain(p.email);
  if (d && !isFreeMail(d)) return d.split(".")[0].toUpperCase();
  return (String(p.name || "").trim() || String(p.email).trim()).toUpperCase();
}

// ── Dates (IST calendar day, like the rest of the CRM) ─────────────────
export const istParts = (now = new Date()) => {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString();
  return { date: ist.slice(0, 10), time: ist.slice(11, 16) };
};

// ── Campaign fields (first touch) ──────────────────────────────────────
export function campaignFields(p) {
  const c = p.campaign || {};
  const t = (v) => (String(v ?? "").trim() || null);
  return {
    utm_source: t(c.utm_source), utm_medium: t(c.utm_medium), utm_campaign: t(c.utm_campaign),
    utm_content: t(c.utm_content), utm_term: t(c.utm_term),
    landing_page: t(c.landing_page), first_referrer: t(c.referrer),
  };
}

// On a repeat enquiry: fill only what is still empty. First touch wins.
export function fillEmpty(existing, incoming) {
  const patch = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v != null && v !== "" && (existing[k] == null || existing[k] === "")) patch[k] = v;
  }
  return patch;
}

const fieldsOf = (p) => p.fields || {};
const timezoneOf = (p) => { const f = fieldsOf(p); return String(f.timezone || f.time_zone || f.tz || "").trim() || null; };

// ── New lead row (snake_case, ready to insert) ─────────────────────────
export function buildNewLead({ p, cls, product, owner, accountId, id, leadId, now = new Date() }) {
  const f = fieldsOf(p);
  const camp = campaignFields(p);
  const consent = p.marketing_consent === true || p.marketing_consent === "yes";
  return {
    id, lead_id: leadId,
    company: companyFor(p),
    contact_name: String(p.name || "").trim() || null,
    email: String(p.email).trim().toLowerCase(),
    phone: String(p.phone || "").trim() || null,
    product: product ? product.id : (String(p.product || "").trim() || null),
    source: cls.source,
    stage: "MQL",
    temperature: cls.kind === "demo" ? "Hot" : "Warm",
    owner: owner || null,
    assigned_at: owner ? now.toISOString() : null,
    account_id: accountId || null,
    created_date: istParts(now).date,
    notes: String(f.note || "").trim() || null,
    campaign_name: camp.utm_campaign,
    demo_status: cls.kind === "demo" ? "New" : null,
    ...camp,
    marketing_consent: consent,
    marketing_consent_at: consent ? now.toISOString() : null,
    website_lead_ref: String(p.lead_ref || "").trim() || null,
    preferred_time: String(f.preferred_time || "").trim() || null,
    visitor_timezone: timezoneOf(p),
  };
}

// ── Patch for a repeat enquiry on an existing lead ─────────────────────
// Campaign stays first touch. Consent can be granted, never silently
// withdrawn here (opt-out comes from Mailchimp). A returning Lost / Nurture
// demo lead goes back to Qualified with its history kept; a lead with no
// demo status that now asks for a demo starts at New.
export function buildRepeatPatch({ existing, p, cls, now = new Date() }) {
  const patch = fillEmpty(existing, {
    ...campaignFields(p),
    campaign_name: campaignFields(p).utm_campaign,
    website_lead_ref: String(p.lead_ref || "").trim() || null,
    phone: String(p.phone || "").trim() || null,
    preferred_time: String(fieldsOf(p).preferred_time || "").trim() || null,
    visitor_timezone: timezoneOf(p),
  });
  const consent = p.marketing_consent === true || p.marketing_consent === "yes";
  if (consent && !existing.marketing_consent) { patch.marketing_consent = true; patch.marketing_consent_at = now.toISOString(); }
  if (cls.kind === "demo") {
    if (!existing.demo_status) patch.demo_status = "New";
    else if (["Lost", "Nurture"].includes(existing.demo_status)) patch.demo_status = "Qualified";
  }
  return patch;
}

// ── The owner's first-response task ────────────────────────────────────
// Logged as a planned Call due today, so it lands on the owner's day plan
// and shows as overdue if nobody responds.
export function buildActivity({ p, cls, lead, product, repeat, id, now = new Date() }) {
  const f = fieldsOf(p);
  const { date, time } = istParts(now);
  const what = cls.kind === "demo"
    ? `demo request${product ? `: ${product.name}` : (p.product ? `: ${p.product}` : "")}`
    : cls.label.toLowerCase();
  const lines = [
    `${repeat ? "Repeat " : ""}website ${what}.`,
    f.topic && f.topic !== p.product ? `Topic: ${f.topic}` : "",
    f.note ? `Message: ${String(f.note).trim()}` : "",
    f.preferred_time ? `Preferred time: ${f.preferred_time}${timezoneOf(p) ? ` (${timezoneOf(p)})` : ""}` : "",
    p.lead_ref ? `Website reference: ${p.lead_ref}` : "",
    p.page ? `Sent from: ${p.page}` : "",
  ].filter(Boolean);
  return {
    id,
    title: `Respond to ${repeat ? "repeat " : ""}website ${what} — ${lead.contact_name || lead.email}`.slice(0, 200),
    type: "Call",
    status: "Planned",
    date, time,
    owner: lead.owner || null,
    lead_id: lead.id,
    account_id: lead.account_id || null,
    notes: lines.join("\n"),
  };
}

// Tests the lead-intake decision logic: which website submissions become
// leads, product matching against the catalogue, owner-relevant fields,
// first-touch campaign rules, and the owner's first-response task.
// Imports the REAL module the edge function uses.
// Run: node scripts/test-lead-intake.mjs
import {
  classify, matchProduct, companyFor, emailDomain, isFreeMail,
  buildNewLead, buildRepeatPatch, buildActivity, fillEmpty, istParts,
} from "../supabase/functions/lead-intake/logic.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

// Exactly the shape submission-created.js posts.
const payload = (over = {}, fields = {}) => ({
  source: "hansinfomatic.com", form: "demo-request", lead_source: "Website: demo / contact request",
  submitted_at: "2026-10-12T04:00:00.000Z", name: "Anita Sharma", email: "Anita.Sharma@AcmeCargo.com",
  company: "Acme Cargo", phone: "+91 98111 22233", product: "WiseCargo", lead_ref: "HX-7K2P",
  marketing_consent: false,
  campaign: { utm_source: "mailchimp", utm_medium: "email", utm_campaign: "oct-wisecargo", utm_content: "", utm_term: "",
              landing_page: "/products/wisecargo/", referrer: "https://www.linkedin.com/" },
  page: "/contact/",
  fields: { intent: "Book a demo", topic: "WiseCargo · terminal operations", note: "Need a demo for our Delhi terminal",
            preferred_time: "Tue afternoon", timezone: "Asia/Kolkata", ...fields },
  netlify_submission_id: "sub_123",
  ...over,
});

// The live catalogue's 8 products (ids/names as in Masters), one with a Line Manager.
const CATALOG = [
  { id: "iCAFFE", name: "iCAFFE" }, { id: "WiseHandling", name: "WiseHandling" },
  { id: "WiseCargo", name: "WiseCargo", lineManagerId: "u_lotak" }, { id: "WiseCCS", name: "WiseCCS" },
  { id: "WiseDox", name: "WiseDox" }, { id: "WiseTrax", name: "WiseTrax" },
  { id: "EANNEX", name: "E-ANNEX" }, { id: "AMSOcean", name: "AMS Ocean" },
  { id: "CRMExpert", name: "SmartCRM" },
];

console.log("\nClassification — which submissions become leads");
check("Book a demo → demo pipeline", classify(payload()).kind, "demo");
check("demo source is Website", classify(payload()).source, "Website");
check("Partnership intent → ordinary lead", classify(payload({ product: "" }, { intent: "Partnership" })).kind, "lead");
check("Tender or RFP → ordinary lead", classify(payload({ product: "" }, { intent: "Tender or RFP" })).label, "Tender / RFP enquiry");
check("Customer support → skipped", classify(payload({ product: "" }, { intent: "Customer support" })).kind, "skip");
check("Something else → skipped", classify(payload({ product: "" }, { intent: "Something else" })).kind, "skip");
check("no intent but a product → demo", classify(payload({}, { intent: "" })).kind, "demo");
check("unknown intent → kept as a lead, never lost", classify(payload({ product: "" }, { intent: "Investor relations" })).kind, "lead");
check("partner-enquiry form → lead", classify(payload({ form: "partner-enquiry" })).kind, "lead");
check("event-meeting form → lead with Events source", classify(payload({ form: "event-meeting" })).source, "Events");
check("newsletter → skipped", classify(payload({ form: "newsletter" })).kind, "skip");
check("paper-download → skipped", classify(payload({ form: "paper-download" })).kind, "skip");
check("unknown form → skipped", classify(payload({ form: "careers" })).kind, "skip");
check("invalid e-mail → skipped", classify(payload({ email: "not-an-email" })).kind, "skip");
check("missing e-mail → skipped", classify(payload({ email: "" })).reason, "No valid e-mail address.");

console.log("\nProduct matching — website names vs catalogue");
const m = (n) => matchProduct(n, CATALOG)?.id ?? null;
check("WiseCargo exact", m("WiseCargo"), "WiseCargo");
check("WiseDOX → WiseDox (case)", m("WiseDOX"), "WiseDox");
check("E-Annex Ultra → EANNEX (alias)", m("E-Annex Ultra"), "EANNEX");
check("AMS → AMS Ocean (prefix)", m("AMS"), "AMSOcean");
check("CRM Expert → SmartCRM (renamed product)", m("CRM Expert"), "CRMExpert");
check("iCAFFE exact", m("iCAFFE"), "iCAFFE");
check("Not sure yet → no product", m("Not sure yet"), null);
check("product not in the live catalogue (WiseFleet) → no match", m("WiseFleet"), null);
check("blank → no match", m(""), null);
check("no catalogue → no match, no crash", matchProduct("WiseCargo", undefined), null);

console.log("\nCompany and domain");
check("typed company → ALL CAPS", companyFor(payload()), "ACME CARGO");
check("no company, corporate e-mail → domain", companyFor(payload({ company: "" })), "ACMECARGO");
check("no company, free mail → person's name", companyFor(payload({ company: "", email: "anita@gmail.com" })), "ANITA SHARMA");
check("domain extracted, lower-cased", emailDomain("A@AcmeCargo.COM"), "acmecargo.com");
check("gmail is free mail", isFreeMail("gmail.com"), true);
check("corporate domain is not free mail", isFreeMail("adani.com"), false);

console.log("\nNew lead row");
const now = new Date("2026-10-12T04:00:00.000Z");   // 09:30 IST
const cls = classify(payload());
const lead = buildNewLead({ p: payload(), cls, product: matchProduct("WiseCargo", CATALOG), owner: "u_lotak", accountId: null, id: "ld1", leadId: "#FL-2026-997", now });
check("lead number from allocator", lead.lead_id, "#FL-2026-997");
check("e-mail stored lower-case", lead.email, "anita.sharma@acmecargo.com");
check("product stored as catalogue id", lead.product, "WiseCargo");
check("stage MQL, demo status New", [lead.stage, lead.demo_status], ["MQL", "New"]);
check("demo request is Hot", lead.temperature, "Hot");
check("owner + assigned_at set together", [lead.owner, lead.assigned_at], ["u_lotak", "2026-10-12T04:00:00.000Z"]);
check("created_date is the IST day", lead.created_date, "2026-10-12");
check("UTM captured", [lead.utm_source, lead.utm_medium, lead.utm_campaign], ["mailchimp", "email", "oct-wisecargo"]);
check("blank UTM stored as null, not ''", lead.utm_content, null);
check("campaign_name mirrors utm_campaign (existing app column)", lead.campaign_name, "oct-wisecargo");
check("landing page + referrer", [lead.landing_page, lead.first_referrer], ["/products/wisecargo/", "https://www.linkedin.com/"]);
check("consent unticked → false, no timestamp", [lead.marketing_consent, lead.marketing_consent_at], [false, null]);
check("consent 'yes' → true with timestamp", buildNewLead({ p: payload({ marketing_consent: true }), cls, now, id: "x", leadId: "y" }).marketing_consent_at, "2026-10-12T04:00:00.000Z");
check("website ref, preferred time, time zone", [lead.website_lead_ref, lead.preferred_time, lead.visitor_timezone], ["HX-7K2P", "Tue afternoon", "Asia/Kolkata"]);
check("requirement goes to notes", lead.notes, "Need a demo for our Delhi terminal");
check("unmatched product keeps the website name", buildNewLead({ p: payload({ product: "WiseFleet" }), cls, product: null, now, id: "x", leadId: "y" }).product, "WiseFleet");
check("no owner → no assigned_at", buildNewLead({ p: payload(), cls, owner: null, now, id: "x", leadId: "y" }).assigned_at, null);
const partner = classify(payload({ product: "" }, { intent: "Partnership" }));
check("non-demo lead has no demo status and is Warm", [buildNewLead({ p: payload({ product: "" }, { intent: "Partnership" }), cls: partner, now, id: "x", leadId: "y" }).demo_status, buildNewLead({ p: payload(), cls: partner, now, id: "x", leadId: "y" }).temperature], [null, "Warm"]);

console.log("\nRepeat enquiry — first touch wins");
const existing = { id: "ld0", owner: "u_amit", utm_source: "google", utm_campaign: "spring", landing_page: "/", first_referrer: null,
  campaign_name: "spring", website_lead_ref: "HX-OLD1", phone: "", demo_status: null, marketing_consent: false };
const patch = buildRepeatPatch({ existing, p: payload(), cls, now });
check("existing UTM source / campaign NOT overwritten", ["utm_source" in patch, "utm_campaign" in patch, "campaign_name" in patch], [false, false, false]);
check("empty fields filled (referrer, phone, medium)", [patch.first_referrer, patch.phone, patch.utm_medium], ["https://www.linkedin.com/", "+91 98111 22233", "email"]);
check("original website ref kept", "website_lead_ref" in patch, false);
check("no demo status yet → New", patch.demo_status, "New");
check("returning Lost → Qualified", buildRepeatPatch({ existing: { ...existing, demo_status: "Lost" }, p: payload(), cls, now }).demo_status, "Qualified");
check("returning Nurture → Qualified", buildRepeatPatch({ existing: { ...existing, demo_status: "Nurture" }, p: payload(), cls, now }).demo_status, "Qualified");
check("active demo status left alone", "demo_status" in buildRepeatPatch({ existing: { ...existing, demo_status: "Demo Scheduled" }, p: payload(), cls, now }), false);
check("consent granted on repeat", buildRepeatPatch({ existing, p: payload({ marketing_consent: true }), cls, now }).marketing_consent, true);
check("consent never withdrawn by an unticked repeat", "marketing_consent" in buildRepeatPatch({ existing: { ...existing, marketing_consent: true }, p: payload(), cls, now }), false);
check("owner never changed on repeat", "owner" in patch, false);
check("fillEmpty ignores null / '' incoming", fillEmpty({ a: null }, { a: "", b: null }), {});

console.log("\nFirst-response task");
const act = buildActivity({ p: payload(), cls, lead, product: matchProduct("WiseCargo", CATALOG), repeat: false, id: "act1", now });
check("planned Call due today for the owner", [act.type, act.status, act.date, act.owner], ["Call", "Planned", "2026-10-12", "u_lotak"]);
check("linked to the lead", act.lead_id, "ld1");
check("title names product and person", act.title, "Respond to website demo request: WiseCargo — Anita Sharma");
check("notes carry message, time, reference", act.notes.split("\n"), [
  "website demo request: WiseCargo.",
  "Topic: WiseCargo · terminal operations",
  "Message: Need a demo for our Delhi terminal",
  "Preferred time: Tue afternoon (Asia/Kolkata)",
  "Website reference: HX-7K2P",
  "Sent from: /contact/",
]);
check("repeat enquiry is labelled", buildActivity({ p: payload(), cls, lead: existing, product: null, repeat: true, id: "a", now }).title.startsWith("Respond to repeat website demo request"), true);
check("IST time of day", istParts(now).time, "09:30");
check("IST date rolls over at local midnight", istParts(new Date("2026-10-11T19:00:00Z")).date, "2026-10-12");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

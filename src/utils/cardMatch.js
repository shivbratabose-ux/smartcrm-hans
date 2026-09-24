// ═══════════════════════════════════════════════════════════════════
// Visiting-card matching — "is this person / company already in the CRM?"
// ═══════════════════════════════════════════════════════════════════
// Pure (no React, no imports) so scripts/test-card-match.mjs runs the exact
// code the scanner uses. Input `card` is the AI extraction (possibly edited
// by the user): { name, designation, department, company, emails[],
// phones[{type, number}], website, address{line,city,state,pincode,country},
// linkedin }.
//
// Match strength:
//   strong   the same person / company for certain — same email, same phone,
//            or the same company name once "Pvt. Ltd." etc. are stripped
//   medium   very likely — same company email domain / website, or the
//            same person's name at the matching company
//   weak     worth a look — one company name contains the other

// Free-mail domains say nothing about the company.
const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com",
  "rediffmail.com", "rediff.com", "protonmail.com", "proton.me", "gmx.com", "mail.com",
  "zoho.com", "zohomail.com", "yandex.com", "inbox.com",
]);

// Legal suffixes / filler that vary between how a card and the CRM spell a company.
const COMPANY_NOISE = /\b(private|pvt|limited|ltd|llp|llc|inc|incorporated|corp|corporation|co|company|the|plc|gmbh|pte|opc)\b/g;

export function normCompany(s) {
  return String(s || "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(COMPANY_NOISE, " ")
    .replace(/\s+/g, " ").trim();
}

// Last 10 digits — an Indian mobile/landline written with or without +91 / 0.
export function phoneKey(s) {
  const d = String(s || "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : "";
}

export function emailKey(s) { return String(s || "").trim().toLowerCase(); }

export function emailDomain(e) {
  const m = emailKey(e).match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  return m ? m[1] : "";
}

export function webDomain(w) {
  return String(w || "").trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
}

const nameKey = (s) => String(s || "").toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

// The card's company domain: website first, else a non-generic email domain.
export function cardDomain(card) {
  const w = webDomain(card?.website);
  if (w && !GENERIC_DOMAINS.has(w)) return w;
  for (const e of card?.emails || []) {
    const d = emailDomain(e);
    if (d && !GENERIC_DOMAINS.has(d)) return d;
  }
  return "";
}

const RANK = { strong: 3, medium: 2, weak: 1 };
const better = (a, b) => (RANK[a] || 0) >= (RANK[b] || 0) ? a : b;
function add(map, rec, strength, reason) {
  const cur = map.get(rec.id);
  if (!cur) map.set(rec.id, { record: rec, strength, reasons: [reason] });
  else { cur.strength = better(cur.strength, strength); if (!cur.reasons.includes(reason)) cur.reasons.push(reason); }
}
const ranked = (map, limit = 5) => [...map.values()]
  .sort((a, b) => RANK[b.strength] - RANK[a.strength] || b.reasons.length - a.reasons.length)
  .slice(0, limit);

const live = (arr) => (arr || []).filter(r => r && !r.isDeleted);

/**
 * @returns {{ contacts, accounts, leads, opps, suggestion }}
 *   each list: [{ record, strength, reasons[] }] strongest first (max 5)
 *   suggestion: "update-contact" | "add-to-account" | "add-to-lead" | "new-lead"
 */
export function matchCard(card, { accounts = [], contacts = [], leads = [], opps = [] } = {}) {
  const emails = new Set((card?.emails || []).map(emailKey).filter(Boolean));
  const phones = new Set((card?.phones || []).map(p => phoneKey(p?.number ?? p)).filter(Boolean));
  const company = normCompany(card?.company);
  const domain = cardDomain(card);
  const person = nameKey(card?.name);

  const accs = live(accounts), cons = live(contacts), lds = live(leads);
  const accById = new Map(accs.map(a => [a.id, a]));

  // ── Accounts ──
  const accMap = new Map();
  for (const a of accs) {
    const n = normCompany(a.name), legal = normCompany(a.legalName);
    if (company && (n === company || legal === company)) add(accMap, a, "strong", "Same company name");
    else if (company && company.length >= 4 && n.length >= 4 && (n.includes(company) || company.includes(n))) add(accMap, a, "weak", "Similar company name");
    if (domain && webDomain(a.website) === domain) add(accMap, a, "medium", `Website ${domain}`);
  }
  // An account whose existing contacts use the card's company email domain.
  if (domain) {
    for (const c of cons) {
      if (c.accountId && accById.has(c.accountId) && emailDomain(c.email) === domain) {
        add(accMap, accById.get(c.accountId), "medium", `Contacts at @${domain}`);
      }
    }
  }

  // ── Contacts ──
  const conMap = new Map();
  for (const c of cons) {
    if ([c.email, c.alternateEmail].some(e => e && emails.has(emailKey(e)))) add(conMap, c, "strong", "Same email");
    if ([c.phone, c.alternatePhone].some(p => p && phones.has(phoneKey(p)))) add(conMap, c, "strong", "Same phone");
    if (person && nameKey(c.name) === person) {
      const acc = accById.get(c.accountId);
      const sameCo = acc && company && normCompany(acc.name) === company;
      const sameDom = domain && emailDomain(c.email) === domain;
      if (sameCo || sameDom) add(conMap, c, "medium", "Same name at this company");
    }
  }

  // ── Leads ──
  const leadMap = new Map();
  for (const l of lds) {
    if (l.email && emails.has(emailKey(l.email))) add(leadMap, l, "strong", "Same email");
    if (l.phone && phones.has(phoneKey(l.phone))) add(leadMap, l, "strong", "Same phone");
    if (company && normCompany(l.company) === company) add(leadMap, l, "medium", "Same company");
    else if (domain && emailDomain(l.email) === domain) add(leadMap, l, "medium", `Email @${domain}`);
  }

  // ── Open deals at the matched accounts, or with the matched contact on them ──
  const oppMap = new Map();
  const matchedAccIds = new Map([...accMap.values()].filter(m => m.strength !== "weak").map(m => [m.record.id, m.strength]));
  const matchedConIds = new Set([...conMap.values()].map(m => m.record.id));
  for (const o of live(opps)) {
    if (["Won", "Lost"].includes(o.stage)) continue;
    if (matchedAccIds.has(o.accountId)) add(oppMap, o, matchedAccIds.get(o.accountId), `Open deal at ${accById.get(o.accountId)?.name || "this account"}`);
    const onDeal = [o.primaryContactId, ...(o.secondaryContactIds || [])].some(id => matchedConIds.has(id));
    if (onDeal) add(oppMap, o, "strong", "This contact is on the deal");
  }

  const out = {
    contacts: ranked(conMap), accounts: ranked(accMap), leads: ranked(leadMap), opps: ranked(oppMap),
  };
  const top = (list) => list[0]?.strength;
  out.suggestion =
    top(out.contacts) === "strong" ? "update-contact"
    : ["strong", "medium"].includes(top(out.accounts)) ? "add-to-account"
    : ["strong", "medium"].includes(top(out.leads)) ? "add-to-lead"
    : "new-lead";
  return out;
}

// ── Card → CRM contact fields ──────────────────────────────────────
// Mobile first for `phone`; the next number becomes `alternatePhone`.
export function cardToContactFields(card) {
  const phones = (card?.phones || []).filter(p => p?.number && p.type !== "fax");
  const ordered = [...phones.filter(p => p.type === "mobile"), ...phones.filter(p => p.type !== "mobile")];
  const emails = (card?.emails || []).map(emailKey).filter(Boolean);
  const a = card?.address || {};
  return {
    name: String(card?.name || "").trim(),
    designation: String(card?.designation || "").trim(),
    department: String(card?.department || "").trim(),
    email: emails[0] || "",
    alternateEmail: emails[1] || "",
    phone: ordered[0]?.number || "",
    alternatePhone: ordered[1]?.number || "",
    city: a.city || "", state: a.state || "", country: a.country || "", pincode: a.pincode || "",
    linkedInUrl: String(card?.linkedin || "").trim(),
    source: "Visiting card",
  };
}

const FIELD_LABELS = {
  designation: "Designation", department: "Department", email: "Email", alternateEmail: "Alternate email",
  phone: "Phone", alternatePhone: "Alternate phone", city: "City", state: "State", country: "Country",
  pincode: "Pincode", linkedInUrl: "LinkedIn",
};

// Update an existing contact from a card WITHOUT overwriting anything the
// team already entered: only empty fields are filled. A new number/email
// that differs from the stored one goes to the alternate slot if free.
export function mergeCardIntoContact(existing, fields) {
  const patch = {};
  const empty = (v) => v == null || String(v).trim() === "";
  for (const k of Object.keys(FIELD_LABELS)) {
    if (!empty(fields[k]) && empty(existing[k])) patch[k] = fields[k];
  }
  const same = (a, b, key) => key(a) && key(a) === key(b);
  if (!empty(fields.phone) && !empty(existing.phone) && !same(fields.phone, existing.phone, phoneKey)
      && empty(existing.alternatePhone) && !same(fields.phone, existing.alternatePhone, phoneKey)) patch.alternatePhone = fields.phone;
  if (!empty(fields.email) && !empty(existing.email) && !same(fields.email, existing.email, emailKey)
      && empty(existing.alternateEmail)) patch.alternateEmail = fields.email;
  return { patch, added: Object.keys(patch).map(k => FIELD_LABELS[k] || k) };
}

// Next CON-### reference, as on the Contacts page — but ignoring the
// timestamp refs some older code wrote (CON-1790000000000), which would
// otherwise push every new contact to CON-1790000000001.
export function nextContactRef(contacts = []) {
  let max = 0;
  for (const c of contacts || []) {
    const m = String(c?.contactId || "").match(/^CON-(\d{1,6})$/);
    if (m) max = Math.max(max, +m[1]);
  }
  return `CON-${String(max + 1).padStart(3, "0")}`;
}

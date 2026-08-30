// ═══════════════════════════════════════════════════════════════════
// em-ingest pure logic — Email-to-CRM Activity Agent (Module B, E1)
// ═══════════════════════════════════════════════════════════════════
// Plain ESM with zero runtime imports so BOTH Deno (index.ts) and Node
// (scripts/test-email-agent.mjs) import this exact file — the tests
// exercise the shipped code, not a mirror.
//
// Everything here treats email content as UNTRUSTED DATA. Nothing in
// this module stores content; callers must not persist what these
// functions return beyond the fields the schema allows (see the
// deliberately-absent list in add_email_agent_v1.sql).

// ── Signature / quoted-history stripping (spec §2.4) ────────────────
// Heuristic, not perfect: the goal is to focus analysis on the fresh
// message and drop tracking/legal boilerplate. Quoted history is kept
// SEPARATELY (not discarded) so direction inference can look at it —
// it is never stored.
const SIG_MARKERS = [
  /^--\s*$/m,                       // RFC 3676 signature delimiter
  /^best regards[,.]?$/im,
  /^regards[,.]?$/im,
  /^thanks\s*&\s*regards[,.]?$/im,
  /^warm regards[,.]?$/im,
  /^sincerely[,.]?$/im,
  /^sent from my /im,
];
const QUOTE_MARKERS = [
  /^-{3,}\s*original message\s*-{3,}/im,
  /^_{5,}\s*$/m,                    // Outlook divider
  /^on .{5,80} wrote:\s*$/im,       // Gmail reply header
  /^from:\s.+$/im,                  // forwarded-header block
  /^>{1}\s?/m,                      // classic quote prefix
];
const DISCLAIMER_MARKERS = [
  /this e?-?mail (and any attachments? )?(is|are) confidential/i,
  /if you are not the intended recipient/i,
  /computer viruses can be transmitted/i,
];

export function splitEmailBody(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  // Find the earliest quote marker — everything after it is history.
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut && m.index > 0) cut = m.index;
  }
  let fresh = text.slice(0, cut);
  const quoted = text.slice(cut);
  // Trim signature: cut at the earliest signature marker in the LOWER
  // HALF of the fresh text (a "Regards," in line 1 of a long mail is
  // content, not signature).
  let sigCut = fresh.length;
  for (const re of SIG_MARKERS) {
    const m = re.exec(fresh);
    if (m && m.index > fresh.length / 2 && m.index < sigCut) sigCut = m.index;
  }
  fresh = fresh.slice(0, sigCut);
  // Drop disclaimer paragraphs wholesale.
  fresh = fresh
    .split(/\n{2,}/)
    .filter(p => !DISCLAIMER_MARKERS.some(re => re.test(p)))
    .join("\n\n")
    .trim();
  return { fresh, quoted: quoted.trim() };
}

// ── Deterministic CRM identifier scan (spec §4, before any AI) ──────
// These formats are minted by the app itself, so a hit is near-certain:
// leads #FL-2026-001 · opps OPP-2026-042 (and O#FL-...) · quotes
// SQ/M000001/26-27 · tickets TK-001.
export const ID_PATTERNS = [
  { type: "lead",   re: /#?FL-\d{4}-\d{3,}/gi },
  { type: "opp",    re: /\bOPP-\d{4}-\d{3,}\b/gi },
  { type: "quote",  re: /\bSQ\/M\d{6}\/\d{2}-\d{2}/gi },
  { type: "ticket", re: /\bTK-\d{3,}\b/gi },
];

export function scanIdentifiers(text) {
  const found = [];
  const seen = new Set();
  for (const { type, re } of ID_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(String(text || ""))) !== null) {
      const value = m[0].toUpperCase().replace(/^#/, "");
      const key = `${type}:${value}`;
      if (!seen.has(key)) { seen.add(key); found.push({ type, value }); }
    }
  }
  return found;
}

// ── Matching bands (spec §4) — enforced in code, not prompt ─────────
// candidates: [{type, id, basis, confidence}] assembled by the caller
// from identifier hits, contact-email matches, unique-domain matches.
export function decideMatch(candidates, minAuto = 0.9) {
  const list = (candidates || []).filter(c => c && c.id);
  if (list.length === 0) return { status: "unmatched", match: null, candidates: [] };
  const sorted = [...list].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const top = sorted[0];
  const rivals = sorted.filter(c => c !== top && (c.confidence || 0) >= (top.confidence || 0) - 0.05
    && !(c.type === top.type && c.id === top.id));
  // Multiple near-equal candidates → never guess (spec: request selection).
  if (rivals.length > 0 && (top.confidence || 0) < 0.95) {
    return { status: "needs_match", match: null, candidates: sorted.slice(0, 5) };
  }
  if ((top.confidence || 0) >= minAuto) return { status: "processed", match: top, candidates: sorted.slice(0, 5) };
  if ((top.confidence || 0) >= 0.7) return { status: "needs_match", match: null, candidates: sorted.slice(0, 5) };
  return { status: "unmatched", match: null, candidates: sorted.slice(0, 5) };
}

// ── Auto-update allowlist (spec §7 "permitted automatic updates") ───
// The writer refuses any field not named here, whatever the model says —
// a jailbroken output physically cannot mark an opp Won or touch money,
// owners, or consent fields, because no code path writes them.
export const AUTO_UPDATE_ALLOWLIST = new Set([
  "lead:lastContactDate", "lead:nextCall", "lead:temperature",
  "account:lastContactDate",
  "opp:lastActivityDate", "opp:nextStep",
  "contact:lastContactDate",
]);

export function filterAutoUpdates(updates, minConfidence = 0.9) {
  const applied = [];
  const rejected = [];
  for (const u of updates || []) {
    const key = `${u?.entityType}:${u?.field}`;
    if (!u || !u.entityId || !AUTO_UPDATE_ALLOWLIST.has(key)) { rejected.push({ ...u, why: "not allowlisted" }); continue; }
    if ((u.confidence || 0) < minConfidence) { rejected.push({ ...u, why: "low confidence" }); continue; }
    applied.push(u);
  }
  return { applied, rejected };
}

// ── Conditional updates (spec §7 "conditional", E3) ─────────────────
// Fields the agent may SUGGEST (never apply) when the email is explicit
// AND the admin has enabled the specific rule. Each carries the target
// table/column so approve-time application needs no second mapping.
// Values are lightly validated here; the human is the real validator.
export const CONDITIONAL_FIELDS = {
  "lead:stage":        { table: "leads",  column: "stage",        maxLen: 60 },
  "opp:stage":         { table: "opps",   column: "stage",        maxLen: 60 },
  "opp:closeDate":     { table: "opps",   column: "close_date",   isDate: true },
  "opp:probability":   { table: "opps",   column: "probability",  isInt: true },
  "quote:status":      { table: "quotes", column: "status",       maxLen: 60 },
  "account:priority":  { table: "accounts", column: "priority",   maxLen: 30 },
};

const condValueOk = (spec, v) => {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (spec.isDate) return /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (spec.isInt) { const n = Number(s); return Number.isInteger(n) && n >= 0 && n <= 100; }
  return s.length <= (spec.maxLen || 60);
};

// Splits the allowlist-rejected updates into suggestions (conditional
// field + rule enabled + value sane) and true drops. Won/Lost stage
// values are ALWAYS suggestions and ALWAYS high-impact, independent of
// rule config — spec §7 lists them under "never automatically" but §9
// says record + request approval, which is exactly a suggestion.
const WONLOST = /^(won|lost|closed[ _-]?won|closed[ _-]?lost)$/i;
export function splitConditionalUpdates(rejected, rules = {}) {
  const suggest = [];
  const drop = [];
  for (const u of rejected || []) {
    const key = `${u?.entityType}:${u?.field}`;
    const spec = CONDITIONAL_FIELDS[key];
    if (!spec || !u?.entityId || !condValueOk(spec, u.newValue)) { drop.push(u); continue; }
    const isWonLost = key.endsWith(":stage") && WONLOST.test(String(u.newValue).trim());
    const enabled = rules && rules[key] === true;
    if (!enabled && !isWonLost) { drop.push(u); continue; }
    suggest.push({ ...u, table: spec.table, column: spec.column, highImpact: isWonLost });
  }
  return { suggest, drop };
}

// §6 intents that signal a possible terminal outcome — surfaced as a
// high-impact suggestion even when the model proposed no field update,
// so a "your offer is approved, please proceed" email can never slip
// through as a mere activity.
export function highImpactFromIntent(intent, matchedType, matchedId) {
  const list = Array.isArray(intent) ? intent : [];
  if (matchedType !== "opp" || !matchedId) return null;
  if (list.includes("Opportunity won indication") || list.includes("Customer approval received") || list.includes("Order confirmation")) {
    return { entityType: "opp", entityId: matchedId, field: "stage", newValue: "Won",
      reason: "Email indicates approval/win — confirm before closing", confidence: 0.5,
      table: "opps", column: "stage", highImpact: true };
  }
  if (list.includes("Opportunity lost indication")) {
    return { entityType: "opp", entityId: matchedId, field: "stage", newValue: "Lost",
      reason: "Email indicates the opportunity is lost — confirm before closing", confidence: 0.5,
      table: "opps", column: "stage", highImpact: true };
  }
  return null;
}

// ── Output hygiene (spec §12 "do not include…") ─────────────────────
// The model is told not to echo content; this enforces it. A summary
// that smuggles a full quoted block or an email address fails closed
// into needs_match for human eyes.
export function summaryViolations(summary, { maxChars = 900 } = {}) {
  const s = String(summary || "");
  const v = [];
  if (s.length > maxChars) v.push("summary too long");
  if (/^-{3,}\s*original message/im.test(s) || /^>{1}\s?.+/m.test(s)) v.push("quoted thread in summary");
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(s)) v.push("email address in summary");
  if (/unsubscribe|click here|http[s]?:\/\/\S{40,}/i.test(s)) v.push("tracking-like content in summary");
  return v;
}

// Intent labels (spec §6) — the schema enum and queue filters share this.
export const INTENTS = [
  "New enquiry", "General follow-up", "Requirement received", "Quotation requested",
  "Quotation submitted", "Quotation revision requested", "Price negotiation",
  "Meeting requested", "Meeting confirmed", "Pending customer response",
  "Customer approval received", "Order confirmation", "Opportunity won indication",
  "Opportunity lost indication", "Service request", "Customer complaint",
  "Payment discussion", "Document request", "Internal action required",
  "Relationship-building communication", "Other",
];

// ── Graph message mapping (E2) ──────────────────────────────────────
// Converts a Microsoft Graph message resource into the neutral email
// payload em-ingest processes. Pure and provider-shaped so the poll
// loop stays a thin fetch-and-forward and this stays testable.

// Minimal HTML→text: Graph returns body.contentType "html" for most
// real mail. Tags out, entities decoded enough for analysis; layout
// fidelity is irrelevant because nothing is stored.
export function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mapGraphMessage(msg) {
  const m = msg || {};
  const isHtml = (m.body?.contentType || "").toLowerCase() === "html";
  const authHeader = (m.internetMessageHeaders || [])
    .find(h => (h?.name || "").toLowerCase() === "authentication-results");
  return {
    messageId: m.internetMessageId || m.id || "",
    receivedAt: m.receivedDateTime || "",
    fromAddress: m.from?.emailAddress?.address || m.sender?.emailAddress?.address || "",
    toAddresses: [
      ...(m.toRecipients || []), ...(m.ccRecipients || []),
    ].map(r => r?.emailAddress?.address).filter(Boolean),
    body: isHtml ? htmlToText(m.body?.content) : String(m.body?.content || ""),
    hasAttachments: !!m.hasAttachments,
    authenticationResults: authHeader?.value || "",
  };
}

// ── Fingerprint (spec §4 dedupe, content-free) ──────────────────────
// HMAC-SHA256(messageId + "|" + mailbox) via WebCrypto — available in
// both Deno and Node ≥ 20 as globalThis.crypto.
export async function fingerprintEmail(messageId, mailbox, secret) {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw", enc.encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC", key, enc.encode(`${String(messageId || "")}|${String(mailbox || "")}`));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

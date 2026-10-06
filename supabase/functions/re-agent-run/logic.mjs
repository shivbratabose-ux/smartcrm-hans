// ═══════════════════════════════════════════════════════════════════
// re-agent-run pure logic — Customer Re-engagement Agent (Module A, R1)
// ═══════════════════════════════════════════════════════════════════
// Plain ESM, zero imports: Deno (index.ts) and Node (the test suite)
// import this exact file. Selection classification and the draft
// guardrails live here — decided by code, verified by tests, never
// left to prompt compliance.

// ── Candidate classification (spec §1/§4) ───────────────────────────
// flags gathered by the caller from real queries. Order = precedence:
// the first matching rule wins, and every applied rule is recorded so
// the audit answers "why did X get (or not get) this email".
export function classifyCandidate(f) {
  const reasons = [];
  const out = (classification) => ({ classification, reasons });
  if (f.doNotContact) { reasons.push("account marked do-not-contact"); return out("do_not_contact"); }
  if (!f.hasVerifiedContact) { reasons.push("no contact with a verified, opted-in email"); return out("insufficient"); }
  if (f.openHighTicket) { reasons.push("open high-priority/escalated ticket — sales follow-up inappropriate"); return out("complaint"); }
  if (f.openPlannedActivity) { reasons.push("an open planned activity already covers this account"); return out("internal_pending"); }
  if (f.awaitingReplyDays != null && f.awaitingReplyDays < 7) {
    reasons.push(`our last outbound is only ${f.awaitingReplyDays}d old — still the customer's turn`);
    return out("waiting_customer");
  }
  if (f.inCooldown) { reasons.push("agent follow-up sent within the cooldown window"); return out("insufficient"); }
  reasons.push(`${f.daysInactive}d without meaningful contact (threshold ${f.thresholdDays}d)`);
  return out("ready");
}

// ── Draft guardrails (spec §5) ──────────────────────────────────────
// The model is instructed; the code verifies. A violating draft is
// still stored (the human sees WHY it was flagged) but lands with
// risk flags instead of a clean bill.
export const BANNED_PHRASES = [
  /\btracked\b/i, /\bmonitored\b/i, /\bcrawl(ed|ing)?\b/i,
  /inactive for/i, /\bno activity\b/i, /haven'?t (heard|been in touch) .*\b(30|sixty|60|ninety|90)\b/i,
  /\bdays? of inactivity\b/i, /our (system|crm|records? show)/i,
  /\bAI\b|\bautomated\b|\bauto-?generated\b/i,
];

export function draftViolations(body, { minWords = 60, maxWords = 200 } = {}) {
  const text = String(body || "");
  const v = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < minWords) v.push(`too short (${words} words; sounds like a stub)`);
  if (words > maxWords) v.push(`too long (${words} words; spec asks 80-150)`);
  for (const re of BANNED_PHRASES) {
    const m = re.exec(text);
    if (m) v.push(`banned phrase: "${m[0]}"`);
  }
  if (/\{\{|\[\[|\[(name|company|requirement)\]/i.test(text)) v.push("unfilled template placeholder");
  if ((text.match(/\?/g) || []).length > 2) v.push("more than one call to action (multiple questions)");
  return v;
}

// Minimal, injection-safe HTML wrap for the approved plain-text body.
export function bodyToHtml(text) {
  const esc = String(text || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("\n");
}

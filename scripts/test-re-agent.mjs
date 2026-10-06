// Verifies the Re-engagement agent's pure logic — the SAME module the
// re-agent-run edge function ships: candidate classification precedence
// and the draft guardrails. Run: node scripts/test-re-agent.mjs
import { classifyCandidate, draftViolations, bodyToHtml, BANNED_PHRASES }
  from "../supabase/functions/re-agent-run/logic.mjs";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`}`);
};
const base = { doNotContact: false, hasVerifiedContact: true, openHighTicket: false,
  openPlannedActivity: false, awaitingReplyDays: null, inCooldown: false,
  daysInactive: 45, thresholdDays: 30 };

console.log("— classification precedence —");
check("clean case is ready", classifyCandidate(base).classification, "ready");
check("ready records the why", classifyCandidate(base).reasons[0].includes("45d"), true);
check("do-not-contact wins over everything",
  classifyCandidate({ ...base, doNotContact: true, openHighTicket: true }).classification, "do_not_contact");
check("no verified contact → insufficient",
  classifyCandidate({ ...base, hasVerifiedContact: false }).classification, "insufficient");
check("open complaint blocks sales follow-up",
  classifyCandidate({ ...base, openHighTicket: true }).classification, "complaint");
check("planned activity → internal_pending",
  classifyCandidate({ ...base, openPlannedActivity: true }).classification, "internal_pending");
check("recent outbound → waiting_customer",
  classifyCandidate({ ...base, awaitingReplyDays: 3 }).classification, "waiting_customer");
check("stale outbound does NOT block",
  classifyCandidate({ ...base, awaitingReplyDays: 12 }).classification, "ready");
check("cooldown → insufficient",
  classifyCandidate({ ...base, inCooldown: true }).classification, "insufficient");

console.log("— draft guardrails —");
const goodDraft = `Hi Priya,

I wanted to reconnect on the E-Annex Ultra discussion we had around your ICEGATE filings. When we last spoke you were evaluating the per-filing commercials for roughly three hundred monthly Bills of Entry, and we owed you a revised proposal covering both import and export documentation flows for the Delhi and Mumbai locations you mentioned.

We have since refreshed our pricing structure, and I think it addresses the volume concerns your team raised during the demo session earlier this quarter.

Would a short call on Thursday work to walk through it together?

Best, Rajesh`;
check("well-formed draft passes", draftViolations(goodDraft), []);
check("banned: noticed you were inactive for 30 days",
  draftViolations(goodDraft + " I noticed your account was inactive for 30 days.").some(v => v.includes("banned phrase")), true);
check("banned: our CRM shows",
  draftViolations(goodDraft + " Our CRM shows no orders lately.").some(v => v.includes("banned phrase")), true);
check("banned: automated/AI disclosure phrasing",
  draftViolations(goodDraft + " This is an automated message.").some(v => v.includes("banned phrase")), true);
check("stub too short", draftViolations("Hi, just checking in. Thanks.").some(v => v.includes("too short")), true);
check("unfilled placeholder caught", draftViolations(goodDraft.replace("Priya", "[Name]")).some(v => v.includes("placeholder")), true);
check("multi-CTA caught", draftViolations(goodDraft + " Also, can you share volumes? And should I loop in your manager?")
  .some(v => v.includes("call to action")), true);
check("banned list is non-trivial", BANNED_PHRASES.length >= 8, true);

console.log("— html wrap —");
check("paragraphs + line breaks", bodyToHtml("Hi Priya,\n\nLine one.\nLine two."),
  "<p>Hi Priya,</p>\n<p>Line one.<br>Line two.</p>");
check("html injection escaped", bodyToHtml("<script>alert(1)</script> & co"),
  "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; co</p>");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

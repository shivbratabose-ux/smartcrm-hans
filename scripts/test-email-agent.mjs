// Verifies the Email-to-CRM agent's pure processing logic — the SAME
// module the em-ingest edge function ships (no mirror to drift):
// signature/quote stripping, deterministic ID scan, matching bands,
// the auto-update allowlist, output hygiene, and the content-free
// fingerprint. Run: node scripts/test-email-agent.mjs  (npm run test:email)
import {
  splitEmailBody, scanIdentifiers, decideMatch,
  filterAutoUpdates, summaryViolations, fingerprintEmail, INTENTS,
} from "../supabase/functions/em-ingest/logic.mjs";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`}`);
};

console.log("— body splitting —");
const mail = `Hi Rajesh,

Please share the revised quotation for 10 containers by 3 September.

Regards,
Priya Sharma
ABC Logistics
This email and any attachments are confidential.

On 26 Aug 2026, Rajesh <rajesh@hansinfomatic.com> wrote:
> Sure, sending shortly.
> Ref OPP-2026-042`;
const { fresh, quoted } = splitEmailBody(mail);
check("fresh keeps the ask", fresh.includes("revised quotation for 10 containers"), true);
check("fresh drops quoted history", fresh.includes("sending shortly"), false);
check("fresh drops disclaimer", /confidential/i.test(fresh), false);
check("signature trimmed", fresh.includes("Priya Sharma"), false);
check("quoted history preserved separately", quoted.includes("OPP-2026-042"), true);
check("greeting-line Regards is content, not signature",
  splitEmailBody("Regards to your team.\nWe accept the offer for 5 sites.\nMore text here to pad the body length out.").fresh.includes("We accept"), true);

console.log("— identifier scan —");
check("all four id formats", scanIdentifiers("re #FL-2026-001 and OPP-2026-042, quote SQ/M000123/26-27, ticket TK-017"),
  [{ type: "lead", value: "FL-2026-001" }, { type: "opp", value: "OPP-2026-042" },
   { type: "quote", value: "SQ/M000123/26-27" }, { type: "ticket", value: "TK-017" }]);
check("dedupes repeats", scanIdentifiers("OPP-2026-042 again OPP-2026-042").length, 1);
check("ignores lookalikes", scanIdentifiers("FLIGHT-2026-001 STOPP-2026-042").length, 0);

console.log("— matching bands —");
check("id hit auto-links", decideMatch([{ type: "opp", id: "x", basis: "explicit id", confidence: 0.95 }]).status, "processed");
check("0.8 needs review", decideMatch([{ type: "account", id: "a", basis: "domain", confidence: 0.8 }]).status, "needs_match");
check("0.5 unmatched", decideMatch([{ type: "account", id: "a", basis: "name", confidence: 0.5 }]).status, "unmatched");
check("near-tie never guesses", decideMatch([
  { type: "account", id: "a1", basis: "domain", confidence: 0.9 },
  { type: "account", id: "a2", basis: "domain", confidence: 0.88 },
]).status, "needs_match");
check("explicit id beats a rival", decideMatch([
  { type: "opp", id: "o1", basis: "explicit id", confidence: 0.97 },
  { type: "account", id: "a1", basis: "domain", confidence: 0.93 },
]).status, "processed");
check("empty → unmatched", decideMatch([]).status, "unmatched");

console.log("— auto-update allowlist —");
const { applied, rejected } = filterAutoUpdates([
  { entityType: "lead", entityId: "l1", field: "nextCall", newValue: "2026-09-02", confidence: 0.95 },
  { entityType: "opp", entityId: "o1", field: "stage", newValue: "Won", confidence: 0.99 },       // forbidden
  { entityType: "opp", entityId: "o1", field: "value", newValue: "9999", confidence: 0.99 },      // forbidden
  { entityType: "account", entityId: "a1", field: "doNotContact", newValue: "No", confidence: 1 },// forbidden
  { entityType: "opp", entityId: "o1", field: "nextStep", newValue: "send quote", confidence: 0.6 }, // low conf
]);
check("allowlisted + confident applies", applied.map(u => u.field), ["nextCall"]);
check("Won/value/consent/low-conf all refused", rejected.length, 4);

console.log("— output hygiene —");
check("clean summary passes", summaryViolations("Priya asked for a revised quotation for 10 containers by 3 Sep. Rajesh to send it."), []);
check("email address caught", summaryViolations("Reach priya@abc.com for details").includes("email address in summary"), true);
check("quoted block caught", summaryViolations("--- Original Message ---\n> hi").includes("quoted thread in summary"), true);

console.log("— fingerprint —");
const f1 = await fingerprintEmail("<msg1@mail>", "communication@hansinfomatic.com", "s3cret");
const f2 = await fingerprintEmail("<msg1@mail>", "communication@hansinfomatic.com", "s3cret");
const f3 = await fingerprintEmail("<msg2@mail>", "communication@hansinfomatic.com", "s3cret");
check("deterministic", f1 === f2, true);
check("distinct per message", f1 === f3, false);
check("hex sha256 length", f1.length, 64);
check("content never enters fingerprint input", /msg1/.test(f1), false);

console.log("— intents —");
check("spec §6 label count", INTENTS.length, 21);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

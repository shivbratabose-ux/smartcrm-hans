// Verifies the notify-leave edge function's pure logic — the same module
// the function deploys. Run: node scripts/test-leave-notify.mjs
import { validatePayload, resolveRecipients, buildEmail, describeDates, escapeHtml, canApprove } from "../supabase/functions/notify-leave/logic.mjs";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`}`);
};

const users = [
  { id: "ad", name: "Asha Admin", email: "admin@x.com", role: "admin" },
  { id: "ad2", name: "Old Admin", email: "old@x.com", role: "admin", active: false },
  { id: "cm", name: "Chitra Country", email: "cm@x.com", role: "country_mgr" },
  { id: "lm", name: "Lalit Manager", email: "lm@x.com", role: "line_mgr", reports_to: "cm" },
  { id: "rep", name: "Ravi Rep", email: "rep@x.com", role: "sales_exec", reports_to: "lm" },
  { id: "peer", name: "Pooja Peer", email: "peer@x.com", role: "sales_exec", reports_to: "lm" },
  { id: "orph", name: "Om Orphan", email: "orph@x.com", role: "sales_exec" },
  { id: "noMail", name: "No Mail Mgr", email: "", role: "line_mgr" },
  { id: "rep2", name: "Rita", email: "rita@x.com", role: "sales_exec", reports_to: "noMail" },
];

console.log("— payload —");
const base = { kind: "requested", ownerId: "rep", type: "Leave", dates: ["2026-09-21", "2026-09-22"] };
check("valid request", validatePayload(base), null);
check("bad kind", validatePayload({ ...base, kind: "spam" }) !== null, true);
check("bad date", validatePayload({ ...base, dates: ["21-09-2026"] }) !== null, true);
check("too many dates", validatePayload({ ...base, dates: Array(61).fill("2026-09-21") }) !== null, true);
check("decided needs decision", validatePayload({ ...base, kind: "decided" }) !== null, true);

console.log("— recipients —");
check("request → line manager", resolveRecipients({ kind: "requested", callerId: "rep", ownerId: "rep", users }).to.map(u => u.email), ["lm@x.com"]);
check("request for someone else is refused", resolveRecipients({ kind: "requested", callerId: "peer", ownerId: "rep", users }).status, 403);
check("no line manager → active admins only", resolveRecipients({ kind: "requested", callerId: "orph", ownerId: "orph", users }).to.map(u => u.email), ["admin@x.com"]);
check("manager without email → admins, with reason", resolveRecipients({ kind: "requested", callerId: "rep2", ownerId: "rep2", users }).fallback, "line manager has no email — sent to admins");
check("decision by line manager → requester", resolveRecipients({ kind: "decided", callerId: "lm", ownerId: "rep", users }).to.map(u => u.email), ["rep@x.com"]);
check("decision by manager's manager ok", resolveRecipients({ kind: "decided", callerId: "cm", ownerId: "rep", users }).ok, true);
check("decision by peer refused", resolveRecipients({ kind: "decided", callerId: "peer", ownerId: "rep", users }).status, 403);
check("self-approval refused", canApprove("rep", "rep", users), false);
check("unknown person", resolveRecipients({ kind: "requested", callerId: "zz", ownerId: "zz", users }).status, 404);

console.log("— content —");
check("date span", describeDates(["2026-09-22", "2026-09-21"], "Leave").text, "Mon 21 Sep 2026 – Tue 22 Sep 2026 (2 working days)");
check("half day", describeDates(["2026-09-21"], "Half-day leave").text, "Mon 21 Sep 2026 (0.5 working days, half days)");
const req = buildEmail({ kind: "requested", owner: users[4], recipient: users[3], type: "Leave", dates: base.dates, reason: "<script>x</script> family", appUrl: "https://smartcrm-hans.vercel.app" });
check("request subject", req.subject, "Leave request: Ravi Rep · Mon 21 Sep 2026 – Tue 22 Sep 2026");
check("request greets manager by first name", req.html.includes("Hi Lalit,"), true);
check("reason is HTML-escaped", [req.html.includes("<script>"), req.html.includes("&lt;script&gt;")], [false, true]);
check("request links to the app", req.html.includes('href="https://smartcrm-hans.vercel.app/"'), true);
const dec = buildEmail({ kind: "decided", owner: users[4], actor: users[3], type: "Leave", dates: ["2026-09-21"], decision: "Rejected", note: "Quarter-end week" });
check("decision subject", dec.subject, "Leave rejected: Mon 21 Sep 2026");
check("rejection shows reason", dec.html.includes("Reason") && dec.html.includes("Quarter-end week"), true);
check("admin day is a valid type", validatePayload({ ...base, type: "Admin day" }), null);
const adm = buildEmail({ kind: "requested", owner: users[4], recipient: users[3], type: "Admin day", dates: ["2026-09-21"], appUrl: "https://x" });
check("admin day request subject + wording", [adm.subject, adm.html.includes("has requested an admin day"), adm.html.includes(">Admin day<")],
  ["Admin day request: Ravi Rep · Mon 21 Sep 2026", true, true]);
check("admin day decision subject", buildEmail({ kind: "decided", owner: users[4], actor: users[3], type: "Admin day", dates: ["2026-09-21"], decision: "Approved" }).subject, "Admin day approved: Mon 21 Sep 2026");
check("admin work needs valid times", [
  validatePayload({ ...base, type: "Admin work", time: "10:00", endTime: "11:00", purpose: "Internal meeting" }),
  validatePayload({ ...base, type: "Admin work", time: "11:00", endTime: "10:00", purpose: "x" }) !== null,
  validatePayload({ ...base, type: "Admin work", time: "10:00", endTime: "11:00" }) !== null], [null, true, true]);
const awm = buildEmail({ kind: "requested", owner: users[4], recipient: users[3], type: "Admin work", dates: ["2026-09-17"],
  time: "10:00", endTime: "11:30", purpose: "Preparing quotation <b>", reason: "Quote for Acme", appUrl: "https://x" });
check("admin work subject has the time", awm.subject, "Admin work request: Ravi Rep · Thu 17 Sep 2026 · 10:00–11:30");
check("admin work body: when, purpose (escaped), details", [awm.html.includes("Thu 17 Sep 2026 · 10:00–11:30 (1.5 h)"), awm.html.includes("Preparing quotation &lt;b&gt;"), awm.html.includes(">Details<")], [true, true, true]);
check("admin work decision wording", buildEmail({ kind: "decided", owner: users[4], actor: users[3], type: "Admin work", dates: ["2026-09-17"], time: "10:00", endTime: "10:30", purpose: "Training", decision: "Approved" }).html.includes("Your admin work was approved"), true);
check("escapeHtml", escapeHtml(`a&b"<'`), "a&amp;b&quot;&lt;&#39;");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Tests quote / contract ids and numbers, revisions and the send gate —
// the fixes for the quote-flow bugs found in Nov 2026.
// Run: node scripts/test-doc-numbers.mjs
import { newQuoteId, newContractId, nextQuoteNo, nextContractNo, revisionOf, sendBlockedReason } from "../src/lib/quotation/docNumbers.js";
import { QUOTE_CONFIG } from "../src/data/quotationMasters.js";

// The company-wide format, set explicitly (office-wise is the default now).
const CLASSIC = { ...QUOTE_CONFIG, quoteNumberFormat: "classic" };

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const NOV = new Date(2026, 10, 17);            // FY 26-27
const counter = (start) => { let n = start; return async () => ++n; };
const offline = async () => null;

console.log("\nIds never collide (the QT-001 bug)");
const ids = new Set(Array.from({ length: 5000 }, newQuoteId));
check("5,000 quote ids, all unique", ids.size, 5000);
check("quote ids are qt_…, not QT-###", [...ids][0].startsWith("qt_"), true);
check("contract ids are ct_…", newContractId().startsWith("ct_"), true);

console.log("\nQuote numbers come from the shared counter");
check("counter → SQ/M000013/26-27", await nextQuoteNo(counter(12), CLASSIC, [], NOV), { quoteNo: "SQ/M000013/26-27", provisional: false });
check("counter ignores what this user can see", (await nextQuoteNo(counter(40), CLASSIC, [{ quoteNo: "SQ/M000002/26-27" }], NOV)).quoteNo, "SQ/M000041/26-27");
let asked = ""; await nextQuoteNo(async (k) => { asked = k; return 1; }, CLASSIC, [], NOV);
check("counter is per financial year", asked, "quote:26-27");
await nextQuoteNo(async (k) => { asked = k; return 1; }, CLASSIC, [], new Date(2027, 2, 31));
check("31 Mar 2027 still FY 26-27", asked, "quote:26-27");
await nextQuoteNo(async (k) => { asked = k; return 1; }, CLASSIC, [], new Date(2027, 3, 1));
check("1 Apr 2027 starts FY 27-28", asked, "quote:27-28");
check("offline → local guess, flagged provisional",
  await nextQuoteNo(offline, CLASSIC, [{ quoteNo: "SQ/M000007/26-27" }, { quoteNo: "SQ/M000099/25-26" }], NOV),
  { quoteNo: "SQ/M000008/26-27", provisional: true });

console.log("\nContract numbers");
check("counter → CT-005", await nextContractNo(counter(4)), { contractNo: "CT-005", provisional: false });
check("offline → highest known CT- + 1 (id or number)", await nextContractNo(offline, [{ id: "con4" }, { id: "CT-002" }, { contractNo: "CT-009" }]),
  { contractNo: "CT-010", provisional: true });

console.log("\nA revision starts clean (it used to copy approval, accept link, contract)");
const approved = { id: "qt_a", quoteNo: "SQ/M000003/26-27", version: 1, status: "Sent", approvalStatus: "Approved", approvedBy: "u1",
  approvedAt: "2026-11-10", acceptToken: "f".repeat(48), acceptedDate: "", contractId: "ct_x", signedQuoteUrl: "x",
  emailLog: [{ id: 1 }], isFinal: true, total: 12, items: [{ name: "A" }] };
const rev = revisionOf(approved, { id: "qt_b", today: "2026-11-17" });
check("new id, same quote number, next version", [rev.id, rev.quoteNo, rev.version], ["qt_b", "SQ/M000003/26-27", 2]);
check("back to Draft, not final, supersedes the original", [rev.status, rev.isFinal, rev.supersedesQuoteId], ["Draft", false, "qt_a"]);
check("previous approval NOT inherited — must be re-approved", [rev.approvalStatus, rev.approvedBy, rev.approvedAt], ["Pending", "", ""]);
check("accept link not copied (unique index made the save fail)", rev.acceptToken, "");
check("contract, signed copy and e-mail history not copied", [rev.contractId, rev.signedQuoteUrl, rev.emailLog], ["", "", []]);
check("FINAL / bill / project handover not copied", revisionOf({ ...approved, handover: { finalAt: "t", billId: "b" } }, { id: "x", today: "t" }).handover, {});
check("prices and lines carried over", [rev.total, rev.items.length], [12, 1]);
check("a quote that never needed approval stays that way", revisionOf({ ...approved, approvalStatus: "Not Required" }, { id: "x", today: "t" }).approvalStatus, "Not Required");

console.log("\nSend gate: either screen's approval decision blocks sending");
check("builder said Pending, legacy rule says fine → BLOCKED (was the bypass)", sendBlockedReason({ approvalStatus: "Pending" }, false), "awaiting approval");
check("rejected → blocked", sendBlockedReason({ approvalStatus: "Rejected" }, false), "approval was rejected");
check("legacy rule needs approval, none yet → blocked", sendBlockedReason({ approvalStatus: "" }, true), "needs approval");
check("approved → can send", sendBlockedReason({ approvalStatus: "Approved" }, true), "");
check("no approval needed → can send", sendBlockedReason({ approvalStatus: "Not Required" }, false), "");

console.log("\nOffice-wise numbers (DEL/SQ/0005/2627, as on Hans' quotations)");
const { officeOf, formatOfficeQuoteNo } = await import("../src/lib/quotation/docNumbers.js");
const { companyOf, registrationLine, paymentDetails, COMPANY_DEFAULTS } = await import("../src/lib/quotation/company.js");
const OFF = { quoteNumberFormat: "office" };
let seen = []; const rec = async (k, min) => { seen = [k, min ?? null]; return 6; };
check("DEL counter, own sequence per office + FY", [await nextQuoteNo(rec, OFF, [], NOV, { office: "DEL" }), seen], [{ quoteNo: "DEL/SQ/0006/2627", provisional: false }, ["quote:DEL:26-27", 1]]);
await nextQuoteNo(rec, { ...OFF, quoteOfficeStart: { "DEL:26-27": 6 } }, [], NOV, { office: "DEL" });
check("'continue from' passes the minimum to the counter", seen, ["quote:DEL:26-27", 6]);
check("offline guess within the office and year only", (await nextQuoteNo(offline, OFF, [{ quoteNo: "DEL/SQ/0009/2627" }, { quoteNo: "CCU/SQ/0045/2627" }, { quoteNo: "DEL/SQ/0099/2526" }], NOV, { office: "DEL" })).quoteNo, "DEL/SQ/0010/2627");
check("office from the rep's branch; mapping editable; fallback", [officeOf({ branchId: "br6" }), officeOf({ branchId: "br1" }), officeOf({ branchId: "br2" }, { quoteOfficeCodes: { br2: "NDL" } }), officeOf({ branchId: "zz" }, { quoteDefaultOffice: "bom" })], ["CCU", "BOM", "NDL", "BOM"]);
check("format", formatOfficeQuoteNo("CCU", 45, "23-24"), "CCU/SQ/0045/2324");
check("classic format still available", (await nextQuoteNo(counter(12), { ...QUOTE_CONFIG, quoteNumberFormat: "classic" }, [], NOV)).quoteNo, "SQ/M000013/26-27");

console.log("\nCompany details on quotes and bills");
check("defaults from Hans' quotations", [companyOf({}).name, companyOf({}).signatoryName, companyOf({}).sac], ["Hans Infomatic Pvt. Ltd.", "Parvinder Singh", "997331"]);
check("registration numbers print only once entered", [registrationLine(companyOf({})), registrationLine(companyOf({ company: { cin: "X1", gstin: "G1" } }))], ["", "CIN: X1 · GSTIN: G1"]);
check("an empty box keeps the standard wording", companyOf({ company: { name: "  ", website: "www.example.com" } }).name, COMPANY_DEFAULTS.name);
check("no bank details until the account is entered", paymentDetails(companyOf({})), null);
check("bank details once entered", paymentDetails(companyOf({ company: { bankAccount: "123", bankIfsc: "IFSC1" } }))?.ifsc, "IFSC1");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

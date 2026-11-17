// Quote → Accounts → Implementation rules (flow approved 14 Nov 2026).
// Run: node scripts/test-quote-handover.mjs
import {
  kycProblems, kycComplete, kycOf, GST_UNREGISTERED, approverIds, accountsIds, approvalNoticeDue,
  finalBlockers, handoverStage, quoteAmounts, scopeLines, billFromQuote, projectFromQuote, nextProjectNo,
  customerBaseUrl, acceptLink, kycPageHtml, SMART_CRM_URL,
} from "../src/lib/quotation/handover.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const truthy = (name, v) => check(name, !!v, true);

const KYC = { legalName: "Blueport Customs Brokers Pvt Ltd", pan: "ABCDE1234F", gstin: "33ABCDE1234F1Z5", address: "12 Harbour Road, Chennai, Tamil Nadu 600001" };

console.log("\nKYC: legal name, PAN, GSTIN, address");
check("complete set → no problems", kycProblems(KYC), []);
check("spaces and lower case are tidied before checking", kycProblems({ ...KYC, pan: " abcde1234f ", gstin: "33abcde1234f1z5" }), []);
check("blank → four things missing", kycProblems({}).length, 4);
check("bad PAN", kycProblems({ ...KYC, pan: "ABCD1234F" }), ["PAN should look like ABCDE1234F"]);
check("bad GSTIN", kycProblems({ ...KYC, gstin: "33ABCDE1234F" }), ["GSTIN should be 15 characters, like 27ABCDE1234F1Z5"]);
check("GSTIN belongs to another PAN", kycProblems({ ...KYC, gstin: "33ZZZZZ9999Z1Z5" }), ["GSTIN does not match the PAN"]);
check("customer not GST-registered is a valid answer", kycProblems({ ...KYC, gstin: GST_UNREGISTERED }), []);
check("blank GSTIN is NOT the same as unregistered", kycProblems({ ...KYC, gstin: "" }).length, 1);
check("reads the quote's own fields", kycOf({ legalName: "X Ltd", pan: "abcde1234f", gstin: "", billingAddressSnapshot: " a " }), { legalName: "X Ltd", pan: "ABCDE1234F", gstin: "", address: "a" });
const quote = { id: "qt_1", quoteNo: "SQ/M000013/26-27", version: 1, status: "Accepted", hosting: "Hans", owner: "u1", accountId: "a1", oppId: "o1", contractId: "ct_1",
  title: "Blueport – iCAFFE", currency: "INR", creditDays: 15, paymentTerms: "100% advance", legalName: KYC.legalName, pan: KYC.pan, gstin: KYC.gstin, billingAddressSnapshot: KYC.address,
  subtotal: 4.5, taxAmount: 0.81, total: 5.31,
  hans: { taxableBase: 450000, gstTotal: 81000, grandTotal: 531000 },
  items: [{ name: "iCAFFE Customs", module: "Customs", qty: 25, unit: "User", months: 12 }, { name: "OCR add-on", qty: 1, unit: "Site" }] };
check("kycComplete on a quote", kycComplete(quote), true);

console.log("\nApprovers: the Masters list, else top-level roles");
const users = [{ id: "u1", role: "sales_exec" }, { id: "u2", role: "line_mgr" }, { id: "u3", role: "admin" }, { id: "u4", role: "md", active: false }, { id: "u5", role: "finance" }, { id: "u6", role: "director" }];
const GLOBAL = ["admin", "md", "director", "vp_sales_mkt"];
check("nobody picked → active top-level roles", approverIds({}, users, GLOBAL), ["u3", "u6"]);
check("picked people approve, whatever their role", approverIds({ approverIds: ["u2"] }, users, GLOBAL), ["u2"]);
check("a picked person who left is ignored; if none remain, fall back", approverIds({ approverIds: ["u4", "gone"] }, users, GLOBAL), ["u3", "u6"]);
check("Accounts: Finance role by default", accountsIds({}, users), ["u5"]);
check("Accounts: picked list wins", accountsIds({ accountsUserIds: ["u2", "u5"] }, users), ["u2", "u5"]);

console.log("\nApprovers are told once per request");
check("pending, nobody told yet → due", approvalNoticeDue({ approvalStatus: "Pending", changeLog: [] }), true);
check("already told → not again", approvalNoticeDue({ approvalStatus: "Pending", approvalRequestedAt: "2026-11-17T10:00:00Z", changeLog: [{ field: "approvalNotice", at: "2026-11-17T10:00:05Z" }] }), false);
check("approved, edited, pending again → told again", approvalNoticeDue({ approvalStatus: "Pending", approvedAt: "2026-11-18T09:00:00Z", changeLog: [{ field: "approvalNotice", at: "2026-11-17T10:00:05Z" }] }), true);
check("not pending → nothing to tell", approvalNoticeDue({ approvalStatus: "Approved", changeLog: [] }), false);

console.log("\nMark as FINAL: only when everything is in place");
check("accepted + approved + hosting + KYC → ready", finalBlockers(quote, ""), []);
check("customer has not accepted", finalBlockers({ ...quote, status: "Sent" }, ""), ["The customer has not accepted the quote yet"]);
check("approval pending blocks", finalBlockers(quote, "awaiting approval"), ["Approval: awaiting approval"]);
check("hosting not chosen", finalBlockers({ ...quote, hosting: "" }, ""), ["Hosting (Hans / Client) is not set"]);
check("KYC gaps are listed", finalBlockers({ ...quote, pan: "" }, ""), ["KYC: PAN is missing"]);
check("stages", handoverStage({ ...quote, isFinal: true, handover: { finalAt: "t", billId: "col_1" } }), { accepted: true, final: true, billed: true, confirmed: false, project: false });
check("the old 'final' tick alone is not FINAL", handoverStage({ ...quote, isFinal: true }).final, false);

console.log("\nBill: every number from the quote (nothing verbal)");
check("engine quote → exact rupees, shown in ₹ lakh", quoteAmounts(quote), { taxable: 4.5, gst: 0.81, total: 5.31 });
check("older quote → register totals", quoteAmounts({ total: 11.8, taxAmount: 1.8 }), { taxable: 10, gst: 1.8, total: 11.8 });
check("scope lines", scopeLines(quote), ["iCAFFE Customs [Customs] × 25 User · 12 mo", "OCR add-on × 1 Site"]);
const bill = billFromQuote(quote, { today: "2026-11-17", by: "u5", productId: "iCAFFE" });
check("bill number comes from the quote number", bill.invoiceNo, "PI-SQ/M000013/26-27");
check("revised quote gets its own bill number", billFromQuote({ ...quote, version: 2 }, { today: "2026-11-17", by: "u5" }).invoiceNo, "PI-SQ/M000013/26-27-v2");
check("amounts", [bill.billedAmount, bill.gstAmount, bill.netPayable, bill.pendingAmount, bill.collectedAmount], [4.5, 0.81, 5.31, 4.5, 0]);
check("links and dates (due = credit days)", [bill.accountId, bill.contractId, bill.invoiceDate, bill.dueDate, bill.owner, bill.product], ["a1", "ct_1", "2026-11-17", "2026-12-02", "u5", "iCAFFE"]);
check("no credit days → 30", billFromQuote({ ...quote, creditDays: 0 }, { today: "2026-11-17", by: "u5" }).dueDate, "2026-12-17");
truthy("remarks carry KYC, hosting and the lines", ["ABCDE1234F", "33ABCDE1234F1Z5", "Hosting: Hans", "iCAFFE Customs", "100% advance"].every((s) => bill.remarks.includes(s)));
truthy("passes the Collections form's own checks", bill.invoiceNo && bill.accountId && bill.invoiceDate && bill.dueDate >= bill.invoiceDate && bill.billedAmount > 0);

console.log("\nImplementation project: exactly what was quoted");
check("next project number", nextProjectNo([{ projectNo: "PRJ-2026-004" }, { projectNo: "PRJ-2025-019" }, {}], 2026), "PRJ-2026-020");
const prj = projectFromQuote(quote, { today: "2026-11-20", projectNo: "PRJ-2026-005", leadUserId: "u9", products: ["iCAFFE"], accountName: "BLUEPORT" });
check("links", [prj.projectNo, prj.accountId, prj.oppId, prj.contractId, prj.owner, prj.status, prj.value], ["PRJ-2026-005", "a1", "o1", "ct_1", "u9", "Requirement Gathering", 5.31]);
check("team: delivery lead + sales owner", prj.team, [{ userId: "u9", role: "Delivery Lead" }, { userId: "u1", role: "Sales Owner" }]);
check("no delivery lead known → sales owner holds it", projectFromQuote(quote, { today: "t", projectNo: "p" }).team, [{ userId: "u1", role: "Sales Owner" }]);
truthy("scope lists hosting and modules", prj.scope.includes("Hans-hosted") && prj.scope.includes("iCAFFE Customs [Customs] × 25 User") && prj.scope.includes("SQ/M000013/26-27"));

console.log("\nCustomer links always use the Smart CRM address");
check("on the internal Hans CRM host", customerBaseUrl("", { hostname: "hanscrm.in", origin: "http://hanscrm.in" }), SMART_CRM_URL);
check("on Smart CRM itself", customerBaseUrl("", { hostname: "smartcrm-hans.vercel.app", origin: "https://smartcrm-hans.vercel.app" }), SMART_CRM_URL);
check("a configured address wins (trailing slash removed)", customerBaseUrl("https://crm.example.com/", { hostname: "hanscrm.in" }), "https://crm.example.com");
check("a developer's machine keeps its own", customerBaseUrl("", { hostname: "localhost", origin: "http://localhost:5173" }), "http://localhost:5173");
check("accept link", acceptLink(SMART_CRM_URL, "abc"), "https://smartcrm-hans.vercel.app/#/quote-accept/abc");

console.log("\nKYC page (last page of every quote PDF)");
const blank = kycPageHtml({ quoteNo: "SQ/M000013/26-27", hosting: "Client" }, { acceptUrl: "https://smartcrm-hans.vercel.app/#/quote-accept/abc" });
truthy("starts on a new page", blank.includes("page-break-before:always"));
truthy("asks for all four KYC items", ["Legal name", "PAN", "GSTIN", "Registered / billing address"].every((s) => blank.includes(s)));
truthy("shows the quote number, hosting and the online link", blank.includes("SQ/M000013/26-27") && blank.includes("Client-hosted") && blank.includes("#/quote-accept/abc"));
const filled = kycPageHtml({ ...quote, legalName: "A & B <Ltd>" });
truthy("pre-fills what is known, safely escaped", filled.includes("A &amp; B &lt;Ltd&gt;") && filled.includes("ABCDE1234F") && !filled.includes("<Ltd>"));
truthy("unregistered shown in words", kycPageHtml({ ...quote, gstin: GST_UNREGISTERED }).includes("Not registered under GST"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// AMS IGM / EGM, FWB & FHL, CTM & TP filing (GMR Airport quotation SQ/00149AMS/2526).
// Run: node scripts/test-ams-igm.mjs
import { HANS_CATALOGUE, QUOTE_UNITS } from "../src/data/quotationMasters.js";
import { INIT_PRODUCT_CATALOG } from "../src/data/seed.js";
import { quoteDocumentHtml, quoteDocModel } from "../src/lib/quotation/quoteDocument.js";
import { resolveTermSets, termSetFor } from "../src/lib/quotation/termSets.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const row = (c) => HANS_CATALOGUE.find((r) => r.code === c);

console.log("\nPrice rows");
check("rates", ["AMS05", "AMS06", "AMS07", "AMS08", "AMS09", "AMS10", "AMS11"].map((c) => [row(c).name, row(c).listPrice, row(c).unit]),
  [["Web IGM Filing", 185, "Flight"], ["Web EGM Filing", 185, "Flight"], ["EGM Generation", 100, "EGM"], ["Physical Amendment", 150, "Amendment"], ["FWB & FHL Filing", 10, "Message"], ["CTM Filing", 150, "Filing"], ["TP Filing", 150, "Filing"]]);
check("all usage-billed, under AMS - IGM-EGM Filing", ["AMS05", "AMS09", "AMS11"].every((c) => row(c).pricingModel === "Per-transaction" && row(c).productId === "AMSIGM"), true);
check("units exist", ["EGM", "Message", "Filing", "Amendment"].every((u) => QUOTE_UNITS.includes(u)), true);
check("product card lists the 7 prices", INIT_PRODUCT_CATALOG.find((p) => p.id === "AMSIGM").modules.map((m) => m.mrp), [185, 185, 100, 150, 10, 150, 150]);

console.log("\nTerms set");
const sets = resolveTermSets(null);
check("AMS products use the AMS filing services set", ["AMSOcean", "AMSAir", "AMSIGM"].map((id) => termSetFor(id, sets).id), ["ams", "ams", "ams"]);
check("other products unchanged", [termSetFor("iCAFFE", sets).id, termSetFor("OrbisEDI", sets).id, termSetFor("WiseCargo", sets).id], ["hans", "orbis", "hans"]);

console.log("\nQuotation");
const catalog = INIT_PRODUCT_CATALOG;
const line = (c, qty) => ({ productCode: c, name: row(c).name, pricingModel: "Per-transaction", unit: row(c).unit, qty, months: 12, unitPriceResolved: row(c).listPrice, discountPct: 0, lineTotal: row(c).listPrice * qty * 12 });
const q = { quoteNo: "DEL/SQ/0041/2627", createdDate: "2026-11-19", status: "Draft", approvalStatus: "Not Required",
  items: [line("AMS05", 300), line("AMS06", 300), line("AMS07", 50), line("AMS09", 2000), line("AMS10", 40), line("AMS11", 40)], hans: { party: { name: "Sample Airport Ltd" } } };
const opts = { priceRows: HANS_CATALOGUE, catalog, autoPrint: false };
const m = quoteDocModel(q, opts);
const t = text(quoteDocumentHtml(q, opts));
check("titled by the product", [m.planName, t.includes("Subject: Quotation for AMS - IGM-EGM Filing")], ["AMS - IGM-EGM Filing", true]);
check("usage charges with rates", ["Web IGM Filing Per flight ₹185", "EGM Generation Per EGM ₹100", "FWB &amp; FHL Filing Per message ₹10", "CTM Filing Per filing ₹150", "TP Filing Per filing ₹150"].map((s) => t.includes(s)), [true, true, true, true, true]);
check("about AMS®", t.includes("About AMS® AMS® Version 2.0 is Hans Infomatic's web-based Advanced Manifest System"), true);
check("AMS implementation / payment / requirements", [t.includes("Implementation Immediate"), t.includes("on the actual volume filed in the previous month"), t.includes("registered at ICEGATE, used only for your filings")], [true, true, true]);
check("no SaaS training / go-live wording", [t.includes("10 days of structured training"), t.includes("Within 15 working days")], [false, false]);
check("AMS terms printed", [t.includes("Escalation. Rates escalate by 10% every year."), t.includes("ICEGATE. Filing, acknowledgement and approval"), t.includes("Validity. This quotation is valid until")], [true, true, true]);
check("no software IP / data-handover terms", [t.includes("Intellectual property."), t.includes("500 rupees per GB")], [false, false]);
check("features section skipped (price lines are not features)", t.includes("Features included"), false);
check("no one-time row in payment when there is none", t.includes("Payable with the order"), false);
check("all-usage quote: no empty price table, GST note instead", [t.includes("One-time charges"), t.includes("GST at 18% (charged in addition"), t.includes("GST at 18% is charged in addition, as applicable.")], [false, false, true]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

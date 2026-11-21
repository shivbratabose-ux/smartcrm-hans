// The governing-terms link follows the product and the billing structure
// (decision 21 Nov 2026: documents supplied by the company, the CRM links them).
// Run: node scripts/test-terms-links.mjs
import { resolveTermSets, termSetFor, eulaLinkOf, pickBillingStructure, upsertTermSet } from "../src/lib/quotation/termSets.js";
import { quoteDocModel } from "../src/lib/quotation/quoteDocument.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const MSA = "https://smartcrm-hans.vercel.app/legal/msa-eula-icaffe.html";

check("billing structure: a licence shapes the contract most, then revenue share, hybrid, subscription, usage",
  [pickBillingStructure({ licence: true, subscription: true }), pickBillingStructure({ revenueShare: true, usage: true }), pickBillingStructure({ hybrid: true, usage: true }), pickBillingStructure({ subscription: true, usage: true }), pickBillingStructure({ usage: true }), pickBillingStructure({})],
  ["licence", "revenue_share", "hybrid", "subscription", "usage", ""]);

const plain = resolveTermSets(null);
check("with no billing links set, every quote keeps its product's link (today: the MSA)", eulaLinkOf(termSetFor("AMSOcean", plain), undefined, "usage"), MSA);

const saved = upsertTermSet([], { ...plain.find((s) => s.id === "ams"), byBilling: { usage: "https://example.com/ams-usage-terms.pdf", subscription: " " } }, "2026-11-21");
const sets = resolveTermSets({ quotation: { termSets: saved } });
const ams = termSetFor("AMSIGM", sets);
check("a usage-billed AMS quote links to the AMS usage document", eulaLinkOf(ams, undefined, "usage"), "https://example.com/ams-usage-terms.pdf");
check("a billing structure with no link of its own falls back to the set's link", eulaLinkOf(ams, undefined, "licence"), MSA);
check("blank links are not kept", Object.keys(ams.byBilling), ["usage"]);
check("other products are untouched", eulaLinkOf(termSetFor("iCAFFE", sets), undefined, "usage"), MSA);

const quote = (items) => ({ quoteNo: "Q1", createdDate: "2026-11-21", items, hans: { party: { name: "Cargomar" } } });
const amsQuote = quote([
  { productCode: "AMS02", name: "Ocean Consol Filing (SCMTR)", pricingModel: "Per-transaction", billingClass: "transaction", unit: "HBL", qty: 0, unitPriceResolved: 800 },
  { productCode: "AMS10", name: "One-time Registration", pricingModel: "Implementation", billingClass: "one_time", unit: "Fixed", qty: 1, unitPriceResolved: 5000, lineTotal: 5000 },
]);
const priceRows = [{ code: "AMS02", productId: "AMSOcean", name: "Ocean Consol Filing (SCMTR)" }, { code: "AMS10", productId: "AMSOcean", name: "One-time Registration" }];
const m = quoteDocModel(amsQuote, { priceRows, catalog: [{ id: "AMSOcean", name: "AMS - Ocean Consol" }], termSets: sets, config: {} });
check("the AMS quote (filing per HBL + registration) is pay per use and links to the AMS usage document", [m.billingStructure, m.governing.url], ["usage", "https://example.com/ams-usage-terms.pdf"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

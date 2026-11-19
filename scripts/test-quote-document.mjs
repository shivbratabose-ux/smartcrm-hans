// Customer quotation format (SaiAsta / DEL/SQ/0035/2627 layout).
// Run: node scripts/test-quote-document.mjs
import { quoteDocModel, quoteDocumentHtml, awaitingApproval, featuresOf } from "../src/lib/quotation/quoteDocument.js";
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";
import { resolveTermSets, termSetFor, eulaLinkOf, assignProducts, makeDefault, unknownPlaceholders, DEFAULT_TC, eulaBlocks } from "../src/lib/quotation/termSets.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const catalog = [{ id: "OrbisEDI", name: "Orbis EDI", modules: [] }];
const base = {
  quoteNo: "DEL/SQ/0035/2627", createdDate: "2026-11-18", hosting: "Hans", status: "Draft", approvalStatus: "Not Required",
  items: [
    { productCode: "IC09", name: "EDI set-up", pricingModel: "Implementation", qty: 1, months: 1, unitPriceResolved: 40000, discountPct: 0, lineTotal: 40000 },
    { productCode: "OE02", name: "Orbis EDI Intelligent", pricingModel: "SaaS Subscription", qty: 5, months: 12, unitPriceResolved: 2999, discountPct: 10, lineTotal: 2999 * 5 * 12 * 0.9 },
  ],
  hans: { party: { name: "Sai Asta Logistics", address: "Plot 1, Okhla\nNew Delhi" }, billingFrequency: "Quarterly", overallDiscountPct: 0, showDiscount: false, termsText: "1. Prices are exclusive of GST." },
};
const opts = { priceRows: HANS_CATALOGUE, catalog, logoUrl: "https://crm.example/hans-logo.png", acceptUrl: "https://crm.example/#/accept/abc", autoPrint: false, preparedBy: { name: "A Rep", phone: "99999" } };

console.log("\nLayout");
const html = quoteDocumentHtml(base, opts);
const t = text(html);
check("Hans logo always", html.includes('src="https://crm.example/hans-logo.png"') && html.includes('alt="Hans Infomatic"'), true);
check("title + quotation no.", [t.includes("QUOTATION"), t.includes("DEL/SQ/0035/2627")], [true, true]);
for (const s of ["About OrbisOne", "Your plan", "Features included", "Prices", "Commercial notes", "Implementation, training and support", "Payment terms", "What you need", "Terms and conditions"])
  check(`section: ${s}`, t.includes(s), true);
check("sections are numbered 1..9", (html.match(/<h2>\d+\. /g) || []).length, 9);
check("plan features from the written list", t.includes("Bill of Entry job and ICEGATE filing (by March 2027)"), true);
check("minimum users from the price row", t.includes("Minimum users 5 users"), true);
check("hosted: server setup / DSC not applicable", [t.includes("Server setup: not applicable"), t.includes("DSC server licence: not applicable")], [true, true]);
check("hosted: no server needed", t.includes("Not needed: OrbisOne is hosted by Hans Infomatic."), true);

console.log("\nRows removed from the format");
for (const s of [/minimum monthly billing/i, /quarterly in advance/i, /first[- ]year value/i, /12 months of subscription/i])
  check(`no ${s}`, s.test(t.replace("Billed quarterly in advance, starting from go-live", "")), false);

console.log("\nDiscount shown or not");
const net = quoteDocModel(base, opts);
const sub = net.subs[0];
check("hidden: rate printed net (2,999 less 10%)", Math.round(sub.rate), 2699);
check("hidden: per-month amount", Math.round(sub.amount), 13496);
check("hidden: no Discount column", html.includes('<th class="r">Discount</th>'), false);
const shown = { ...base, hans: { ...base.hans, showDiscount: true, overallDiscountPct: 5 } };
const sm = quoteDocModel(shown, opts);
const sh = quoteDocumentHtml(shown, opts);
check("shown: list rate + discount %", [sm.subs[0].rate, sm.subs[0].discountPct], [2999, 10]);
check("shown: Discount column", sh.includes('<th class="r">Discount</th>'), true);
check("shown: overall discount row", text(sh).includes("Less: discount 5%"), true);
check("shown and hidden net agree", Math.round(sm.totals.netSubs), Math.round(quoteDocModel({ ...base, hans: { ...base.hans, overallDiscountPct: 5 } }, opts).totals.subsShown));
check("GST at 18% on the net subscription", Math.round(net.totals.gstSubs), Math.round(13495.5 * 0.18));

console.log("\nApproval");
check("not pending → accept QR", html.includes("Scan to accept this quotation online"), true);
const pend = { ...base, status: "Approval Required", approvalStatus: "Pending" };
const ph = quoteDocumentHtml(pend, opts);
check("pending → same letterhead, no watermark or banner", [ph.includes('class="wm"'), ph.includes('class="draft"'), ph.includes('alt="Hans Infomatic"')], [false, false, true]);
check("pending → marked subject to approval", text(ph).includes("Status Draft, subject to approval *"), true);
check("pending → footnote for the customer, after the sign-off", [ph.indexOf('class="footnotes"') > ph.indexOf("With warm regards"), text(ph).includes("we will send you the final quotation")], [true, true]);
check("not pending → no approval note", [text(html).includes("subject to approval"), text(html).includes("we will send you the final quotation")], [false, false]);

console.log("\nConfidentiality and governing terms");
check("confidential footnote on every quote", [text(html).includes("is confidential and proprietary information of"), text(html).includes("shared only with Sai Asta Logistics")], [true, true]);
check("'Confidential' in the page footer", html.includes("· Confidential\";"), true);
check("Orbis product → OrbisOne terms link", [html.includes('href="https://orbisone.in/terms.html"'), html.includes("msa-eula")], [true, false]);
const ic = { ...base, items: [{ productCode: "IC08", name: "iCAFFE registration", pricingModel: "Implementation", qty: 1, months: 1, unitPriceResolved: 25000, discountPct: 0, lineTotal: 25000 }] };
const icHtml = quoteDocumentHtml(ic, { ...opts, catalog: [...catalog, { id: "iCAFFE", name: "iCAFFE", modules: [] }] });
check("iCAFFE product → MSA & EULA link (not the full text)", [icHtml.includes('href="https://smartcrm-hans.vercel.app/legal/msa-eula-icaffe.html"'), icHtml.includes("orbisone.in/terms"), icHtml.includes("Grant of License")], [true, false, false]);
const icOpts = { ...opts, catalog: [...catalog, { id: "iCAFFE", name: "iCAFFE", modules: [] }] };

console.log("\nTerms sets (Masters → Terms & EULA)");
const masters = { quotation: { termSets: [
  { id: "hans", eulaMode: "link", eulaUrl: "https://hansinfomatic.com/eula", tc: "1. Payment. Within 15 days.\n2. Law. Courts of {{company}} city.", governing: "{{product}} is licensed under the EULA." },
  { id: "t_ic", name: "iCAFFE only", productIds: ["iCAFFE"], eulaTitle: "iCAFFE EULA", eulaMode: "text", eulaBody: "1. Definitions\n\nText.", tc: "Only iCAFFE term for {{customer}}.", governing: "" },
] } };
const sets = resolveTermSets(masters);
check("built-ins first, then custom", sets.map((s) => s.id), ["orbis", "ams", "hans", "t_ic"]);
check("a product belongs to one set (first wins)", [sets[2].productIds.includes("iCAFFE"), sets[3].productIds.includes("iCAFFE")], [true, false]);
const sets2 = resolveTermSets({ quotation: { termSets: [{ id: "hans", productIds: [] }, { id: "t_ic", productIds: ["iCAFFE"], eulaMode: "text", eulaBody: "1. Definitions\n\nText.", tc: "Only iCAFFE term for {{customer}}." }] } });
check("product moved to a custom set", termSetFor("iCAFFE", sets2).id, "t_ic");
check("unlisted product → default set", termSetFor("WiseCargo", sets2).id, "hans");
check("Orbis product → orbis set", termSetFor("OrbisEDI", sets2).id, "orbis");
check("text mode → CRM public link", eulaLinkOf(termSetFor("iCAFFE", sets2)), "https://smartcrm-hans.vercel.app/#/terms/t_ic");
check("text mode without text → keeps the saved link", [eulaLinkOf({ id: "x", eulaMode: "text", eulaBody: " ", eulaUrl: "https://a" }), eulaLinkOf({ id: "x", eulaMode: "text", eulaBody: "", eulaUrl: "" })], ["https://a", ""]);
const icCustom = quoteDocumentHtml(ic, { ...icOpts, termSets: sets2 });
check("quote prints that set's T&C", [text(icCustom).includes("Only iCAFFE term for Sai Asta Logistics."), text(icCustom).includes("Intellectual property.")], [true, false]);
check("quote links that set's EULA", icCustom.includes('href="https://smartcrm-hans.vercel.app/#/terms/t_ic"'), true);
const icHans = quoteDocumentHtml(ic, { ...icOpts, catalog: [...catalog, { id: "WiseCargo", name: "WiseCargo" }], termSets: sets });
check("edited default set: link + T&C + governing", [icHans.includes('href="https://hansinfomatic.com/eula"'), text(icHans).includes("Payment. Within 15 days."), text(icHans).includes("Law. Courts of Hans Infomatic Pvt. Ltd. city.")], [true, true, true]);
check("T&C numbering not doubled", /<li>\d+\./.test(icHans), false);
check("one default only", resolveTermSets({ quotation: { termSets: [{ id: "orbis", isDefault: true }] } }).filter((s) => s.isDefault).map((s) => s.id), ["orbis"]);
check("assign moves a product between sets", assignProducts(sets, "orbis", ["OrbisOne", "OrbisEDI", "iCAFFE"]).find((s) => s.id === "hans").productIds, []);
check("make default", makeDefault(sets, "t_ic").filter((s) => s.isDefault).map((s) => s.id), ["t_ic"]);
check("unknown placeholders flagged", unknownPlaceholders({ tc: "{{product}} {{custmer}}", governing: "{{quote.no}}" }), ["quote.no", "custmer"]);
check("standard T&C uses placeholders", [DEFAULT_TC.includes("{{product}}"), DEFAULT_TC.split("\n").length], [true, 7]);
check("EULA text → headings and paragraphs", eulaBlocks("1. Definitions\n\n“Customer” means the user.\n\nShort heading").map((b) => b.kind), ["h", "p", "h"]);
check("pending → no accept QR / link", [ph.includes("Scan to accept"), ph.includes("/#/accept/abc")], [false, false]);
check("approved wins over a stale status", awaitingApproval({ status: "Approval Required", approvalStatus: "Approved" }), false);
check("rejected is still not final", awaitingApproval({ approvalStatus: "Rejected" }), true);
check("normal quote", awaitingApproval({ status: "Sent", approvalStatus: "Not Required" }), false);

console.log("\nFallbacks");
const row = HANS_CATALOGUE.find((r) => r.code === "OE01");
check("features from the row description", featuresOf(row, null).length >= 3, true);
check("escapes customer text", quoteDocumentHtml({ ...base, hans: { ...base.hans, party: { name: "<b>X</b>" } } }, opts).includes("&lt;b&gt;X&lt;/b&gt;"), true);
check("no accidental 'undefined' / 'NaN'", /undefined|NaN/.test(t), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

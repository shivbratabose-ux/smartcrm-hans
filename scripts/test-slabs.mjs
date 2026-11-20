// Volume-slab pricing (AMS Ocean Consol per HBL, Cargomar sheet).
// Run: node scripts/test-slabs.mjs
import { normalizeSlabs, slabIndex, slabRate, slabLabel, slabTable, slabProblems } from "../src/lib/quotation/slabs.js";
import { resolveUnitPrice, computeLine } from "../src/lib/quotation/pricingEngine.js";
import { HANS_CATALOGUE, QUOTE_UNITS } from "../src/data/quotationMasters.js";
import { quoteDocumentHtml, quoteDocModel } from "../src/lib/quotation/quoteDocument.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const ocean = HANS_CATALOGUE.find((r) => r.code === "AMS02");
console.log("\nAMS price rows (Cargomar sheet)");
check("registration ₹5,000 one time (ocean + air)", ["AMS01", "AMS03"].map((c) => { const r = HANS_CATALOGUE.find((x) => x.code === c); return [r.listPrice, r.pricingModel, r.productId]; }), [[5000, "Implementation", "AMSOcean"], [5000, "Implementation", "AMSAir"]]);
check("air consol ₹30 per HAWB", (({ listPrice, unit, productId }) => [listPrice, unit, productId])(HANS_CATALOGUE.find((x) => x.code === "AMS04")), [30, "HAWB", "AMSAir"]);
check("ocean consol priced by slab per HBL", [ocean.rateSource, ocean.unit, ocean.pricingModel], ["Slab", "HBL", "Per-transaction"]);
check("HBL and HAWB are units", ["HBL", "HAWB"].every((u) => QUOTE_UNITS.includes(u)), true);

console.log("\nSlab picked by the month's volume");
for (const [qty, rate] of [[0, 800], [1, 800], [200, 800], [201, 700], [500, 700], [501, 500], [699, 500], [700, 400], [5000, 400]])
  check(`${qty} HBL/month → ₹${rate}`, slabRate(qty, ocean.slabs).rate, rate);
check("labels", slabTable(ocean.slabs, "HBL").map((s) => s.label), ["Up to 200 HBL", "201–500 HBL", "501–699 HBL", "700 and above HBL"]);
check("one slab = any volume", slabLabel([{ from: 0, rate: 5 }], 0), "Any volume");
check("unsorted / duplicate slabs cleaned", normalizeSlabs([{ from: 500, rate: 1 }, { from: 10, rate: 2 }, { from: 500, rate: 3 }]), [{ from: 0, rate: 2 }, { from: 500, rate: 1 }]);
check("problems", [slabProblems([]), slabProblems([{ from: 0, rate: null }]), slabProblems(ocean.slabs)], [["Add at least one slab."], ["Every slab needs a rate."], []]);
check("index", slabIndex(350, ocean.slabs), 1);

console.log("\nEngine");
check("resolveUnitPrice uses the slab", [100, 300, 600, 900].map((q) => resolveUnitPrice(ocean, { qty: q }).unitPrice), [800, 700, 500, 400]);
check("missing slab rate flagged", resolveUnitPrice({ ...ocean, slabs: [{ from: 0, rate: null }] }, { qty: 10 }).missingRate, true);
check("no slabs → missing rate", resolveUnitPrice({ ...ocean, slabs: [] }, { qty: 10 }).missingRate, true);
const line = computeLine({ pricingModel: "Per-transaction", unitPriceResolved: resolveUnitPrice(ocean, { qty: 300 }).unitPrice, qty: 300, months: 12, discountPct: 0 });
check("300 HBL/month × 12 months at ₹700: an estimate, nothing committed", [line.lineEstimate, line.lineTotal], [300 * 700 * 12, 0]);

console.log("\nQuotation");
const catalog = [{ id: "AMSOcean", name: "AMS - Ocean Consol", modules: [] }, { id: "AMSAir", name: "AMS - Air Consol", modules: [] }];
const q = {
  quoteNo: "DEL/SQ/0040/2627", createdDate: "2026-11-19", hosting: "Hans", status: "Draft", approvalStatus: "Not Required",
  items: [
    { productCode: "AMS01", name: ocean && "Advanced Manifest System — One-time Registration", pricingModel: "Implementation", qty: 1, months: 1, unitPriceResolved: 5000, discountPct: 0, lineTotal: 5000 },
    { productCode: "AMS02", name: "Ocean Consol Filing (SCMTR)", pricingModel: "Per-transaction", unit: "HBL", qty: 300, months: 12, unitPriceResolved: 700, discountPct: 0, lineTotal: 300 * 700 * 12 },
  ],
  hans: { party: { name: "Cargomar Pvt Ltd" } },
};
const opts = { priceRows: HANS_CATALOGUE, catalog, autoPrint: false };
const html = quoteDocumentHtml(q, opts);
const t = text(html);
check("titled by the product, not the registration line", [quoteDocModel(q, opts).planName, t.includes("Subject: Quotation for AMS - Ocean Consol")], ["AMS - Ocean Consol", true]);
check("prints every slab with its rate", ["Up to 200 HBL per month ₹800", "201–500 HBL per month Per HBL ₹700".replace(" Per HBL", ""), "700 and above HBL per month"].map((s) => t.replace(/ Per HBL /g, " ").includes(s)), [true, true, true]);
check("slab rates in order", [...t.matchAll(/HBL per month Per HBL (₹[\d,]+)/g)].map((m) => m[1]), ["₹800", "₹700", "₹500", "₹400"]);
check("explains the slab rule", t.includes("the whole month is billed at its slab's rate"), true);
check("AMS filing is the usage charge, not an add-on", [t.includes("Variable charges, billed on actual consumption"), t.includes("Add-on services"), t.includes("per HBL: rate")], [true, false, true]);
check("registration in one-time charges", t.includes("Advanced Manifest System — One-time Registration One time ₹5,000"), true);
const disc = { ...q, items: [q.items[0], { ...q.items[1], discountPct: 10 }] };
check("line discount shown net when discount is hidden", [...text(quoteDocumentHtml(disc, opts)).matchAll(/HBL per month Per HBL (₹[\d,]+)/g)].map((m) => m[1]), ["₹720", "₹630", "₹450", "₹360"]);
const shown = { ...disc, hans: { ...disc.hans, showDiscount: true } };
const st = text(quoteDocumentHtml(shown, opts));
check("discount shown → list slab rates + 'less 10%'", [st.includes("less 10% discount"), [...st.matchAll(/HBL per month Per HBL (₹[\d,]+)/g)].map((m) => m[1])], [true, ["₹800", "₹700", "₹500", "₹400"]]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

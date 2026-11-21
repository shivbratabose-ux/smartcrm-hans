// Billing types of a product: what it is sold as, and what that allows on a quote.
import { BILLING_TYPES, typeOfRow, productBilling, withType, withFrequency, billingWarnings, sectionsOf, rowOffered, licenceOffered, quoteFrequencies } from "../src/lib/quotation/billingTypes.js";
import { itemsOf } from "../src/lib/quotation/productItems.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const rows = [
  { code: "OB04", productId: "OrbisOne", name: "Orbis One Enterprise", pricingModel: "SaaS Subscription", unit: "User", listPrice: 4199, rateSource: "Flat" },
  { code: "OB08", productId: "OrbisOne", name: "Orbis One Installation & Training — Enterprise", pricingModel: "Implementation", unit: "User", listPrice: 8000, rateSource: "Flat" },
  { code: "OB14", productId: "OrbisOne", name: "Orbis One — Ocean Container Tracking", pricingModel: "Per-transaction", unit: "Container", listPrice: 85, rateSource: "Flat" },
  { code: "AMS04", productId: "AMSAir", name: "Air Consol Filing", pricingModel: "Per-transaction", unit: "HAWB", listPrice: 30, rateSource: "Flat" },
  { code: "AMS03", productId: "AMSAir", name: "Registration", pricingModel: "Implementation", unit: "Fixed", listPrice: 5000, rateSource: "Flat" },
  { code: "EA01", productId: "EANNEX", name: "E-Annex Ultra", pricingModel: "One-time Licence", unit: "Branch", listPrice: 50000, rateSource: "Flat" },
  { code: "S01", productId: "_services", name: "Implementation & Onboarding", pricingModel: "Implementation", unit: "Fixed", listPrice: null, rateSource: "Flat" },
];
const catalog = [{ id: "OrbisOne", name: "Orbis One", modules: [] }, { id: "AMSAir", name: "AMS - Air Consol", modules: [] }, { id: "EANNEX", name: "E-Annex Ultra", modules: [] }];
const ob = catalog[0], ams = catalog[1];

check("item → billing type", rows.map(typeOfRow), ["subscription", "one_time", "usage", "usage", "one_time", "licence", "one_time"]);
check("not set: worked out from the items (a subscription may also be sold as a licence)", [productBilling(ob, rows, catalog), productBilling(ams, rows, catalog).types, productBilling(catalog[2], rows, catalog).types],
  [{ types: ["subscription", "licence", "usage", "one_time"], frequencies: ["Monthly", "Quarterly", "Half-Yearly", "Annual"], set: false }, ["usage", "one_time"], ["licence"]]);
check("an item that refuses one-time does not add a licence", productBilling(ob, rows.map((r) => (r.code === "OB04" ? { ...r, oneTimeAllowed: false } : r)), catalog).types, ["subscription", "usage", "one_time"]);
const setOb = { ...ob, billing: { types: ["subscription", "one_time"], frequencies: ["Monthly", "Annual"] } };
check("set on the product: exactly what was ticked", productBilling(setOb, rows, catalog), { types: ["subscription", "one_time"], frequencies: ["Monthly", "Annual"], set: true });
check("ticking and unticking keeps the order", [withType({ types: ["usage"], frequencies: [] }, "subscription", true), withFrequency({ types: ["subscription"], frequencies: ["Annual", "Monthly"] }, "Quarterly", true).frequencies],
  [{ types: ["subscription", "usage"], frequencies: ["Monthly", "Quarterly", "Half-Yearly", "Annual"] }, ["Monthly", "Quarterly", "Annual"]]);

const items = itemsOf(setOb, rows, [setOb, ams, catalog[2]]);
check("items of a type the product does not use are named", billingWarnings(productBilling(setOb, rows, catalog), items), ["1 active item is pay per use, which this product is not set to use: they are not offered on quotes."]);
check("subscription with no frequency is named", billingWarnings({ types: ["subscription"], frequencies: [] }, []), ["Subscription is ticked but no billing frequency is."]);
check("sections: the product's types, plus any type its items still are (marked not allowed)", sectionsOf(items, productBilling(setOb, rows, catalog)).map((s) => [s.id, s.allowed, s.items.map((i) => i.row.code)]),
  [["subscription", true, ["OB04"]], ["usage", false, ["OB14"]], ["one_time", true, ["OB08"]]]);

const cat2 = [setOb, ams, catalog[2]];
check("on a quote: items of an unused type are not offered; services and products not set follow their items",
  [rowOffered(rows[0], cat2, rows), rowOffered(rows[2], cat2, rows), rowOffered(rows[3], cat2, rows), rowOffered(rows[6], cat2, rows)], [true, false, true, true]);
check("one-time licence only where the product uses it", [licenceOffered(rows[0], cat2, rows), licenceOffered(rows[0], catalog, rows)], [false, true]);
check("billing frequencies: what every product with a subscription on the quote allows",
  [quoteFrequencies([rows[0], rows[3]], cat2, rows), quoteFrequencies([rows[3]], cat2, rows), quoteFrequencies([rows[0]], catalog, rows)],
  [["Monthly", "Annual"], ["Monthly", "Quarterly", "Half-Yearly", "Annual"], ["Monthly", "Quarterly", "Half-Yearly", "Annual"]]);
check("four billing types", BILLING_TYPES.map((t) => t.id), ["subscription", "licence", "usage", "one_time"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// One product master: every price row belongs to a product or to Services.
// Run: node scripts/test-product-groups.mjs
import { groupOf, groupRates, productsToAdd, newProductId, countsByProduct, SERVICES_GROUP } from "../src/lib/quotation/productGroups.js";
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";
import { INIT_PRODUCT_CATALOG } from "../src/data/seed.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

const catalog = [
  { id: "iCAFFE", name: "iCAFFE" }, { id: "WiseCCS", name: "WiseCCS" }, { id: "OrbisOne", name: "Orbis One" },
  { id: "AMSAir", name: "AMS - Air Consol" },
];

console.log("\nWhere a price row belongs");
check("saved productId wins", groupOf({ name: "Anything", productId: "WiseCCS" }, catalog), "WiseCCS");
check("saved productId that no longer exists falls back to the name", groupOf({ name: "iCAFFE Customs", productId: "Gone" }, catalog), "iCAFFE");
check("by product name inside the row name", groupOf({ name: "WiseCCS — SaaS (with Infrastructure)", module: "WiseCCS (Cargo Community System)" }, catalog), "WiseCCS");
check("names with spaces/dashes match", groupOf({ name: "AMS - Air Consol" }, catalog), "AMSAir");
check("services by module", ["Optional Additional Service", "Professional Services", "Support", "Licence"].map((m) => groupOf({ name: "X", module: m }, catalog)), Array(4).fill(SERVICES_GROUP));
check("explicit Services choice", groupOf({ name: "iCAFFE training", productId: SERVICES_GROUP }, catalog), SERVICES_GROUP);
check("no match → not linked", groupOf({ name: "ACMES", module: "Airport Cargo Community System" }, catalog), "");
check("a word inside another word doesn't match", groupOf({ name: "Wisecare" }, [{ id: "Wise", name: "Wise" }]), "");
check("longest name wins", groupOf({ name: "Business Insights+" }, [{ id: "BI", name: "Business Insights" }, { id: "BIP", name: "Business Insights+" }]), "BIP");

console.log("\nGroups for the Prices table");
const rows = [{ code: "P01", name: "iCAFFE" }, { code: "S01", name: "Implementation", module: "Professional Services" }, { code: "P05", name: "ACMES" }, { code: "CC03", name: "WiseCCS — SaaS" }];
const groups = groupRates(rows, catalog).filter((g) => g.rows.length).map((g) => [g.id, g.rows.map((r) => r.code)]);
check("catalogue order, then services, then not linked", groups, [["iCAFFE", ["P01"]], ["WiseCCS", ["CC03"]], [SERVICES_GROUP, ["S01"]], ["", ["P05"]]]);

console.log("\nPriced items that should become products");
check("ids like the Add Product form; + becomes Plus", [newProductId("TSM-Air", new Set()), newProductId("Business Insights+", new Set()), newProductId("ACMES", new Set(["ACMES"]))], ["TSMAir", "BusinessInsightsPlus", "ACMES2"]);
const add = productsToAdd([...rows, { code: "P99", name: "Old thing", active: false }], catalog);
check("only active, unlinked, non-service rows", add.map((x) => [x.code, x.product.id, x.product.name]), [["P05", "ACMES", "ACMES"]]);
check("new product shape matches the catalogue", Object.keys(add[0].product).sort(), ["bg", "color", "desc", "id", "lineManagerId", "modules", "name"]);
check("counts per product", countsByProduct([{ name: "iCAFFE", listPrice: 100, rateSource: "Flat" }, { name: "iCAFFE Customs", listPrice: null, rateSource: "Flat" }, { name: "iCAFFE band", rateSource: "Band" }], catalog).iCAFFE, { rows: 3, priced: 2 });

console.log("\nThe shipped price list against the shipped product catalogue");
const shipped = groupRates(HANS_CATALOGUE, INIT_PRODUCT_CATALOG);
const notLinked = shipped.find((g) => g.id === "").rows.map((r) => r.code);
// ACMES (P05) has had its own catalogue product since the billing module (Nov 2026).
check("the only unlinked rows are the 4 price-list-only products", notLinked, ["P09", "P12", "P13", "P15"]);
check("15 shared services", shipped.find((g) => g.id === SERVICES_GROUP).rows.length, 15);
check("every row lands somewhere", shipped.reduce((n, g) => n + g.rows.length, 0), HANS_CATALOGUE.length);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

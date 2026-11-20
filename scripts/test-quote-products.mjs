// Product-led quote builder: which products and items the screen offers.
import { quoteProductOptions, rowSections, productsFromOpp, productsFromLines, lineForRow, chipLabel, rowPriceHint, productIdOfRow, OTHER_GROUP } from "../src/lib/quotation/quoteProducts.js";
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";
import { INIT_PRODUCT_CATALOG } from "../src/data/seed.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const catalog = INIT_PRODUCT_CATALOG;
const rows = HANS_CATALOGUE;
const opts = quoteProductOptions(rows, catalog);
const opt = (id) => opts.find((o) => o.id === id);

check("only products with items to quote are offered", opts.every((o) => o.rows.length > 0), true);
check("services come after the catalogue products, unplaced rows last", [opts.at(-2).id, opts.at(-1).id], ["_services", OTHER_GROUP]);
check("services keep a short name", opt("_services").name, "Services & add-ons");
check("inactive rows are left out", quoteProductOptions([{ code: "Z", name: "Orbis One Zed", productId: "OrbisOne", active: false }], catalog), []);

check("Orbis One: fixed recurring, variable and one-time sections, in that order", rowSections(opt("OrbisOne").rows).map((s) => [s.key, s.rows.length]), [["subscription", 5], ["transaction", 7], ["one_time", 4]]);
check("AMS IGM-EGM is usage only", rowSections(opt("AMSIGM").rows).map((s) => s.key), ["transaction"]);
check("Orbis One is a hybrid product; AMS IGM-EGM transaction-based", [opt("OrbisOne").model.key, opt("AMSIGM").model.key], ["hybrid", "transaction"]);

check("products from the opportunity, quotable ones only, no repeats",
  productsFromOpp({ productSelection: [{ productId: "OrbisOne" }, { productId: "NotAProduct" }, { productId: "OrbisOne" }], product: "AMSAir" }, opts), ["OrbisOne", "AMSAir"]);
check("no opportunity → no products", productsFromOpp(null, opts), []);

const byCode = (c) => rows.find((r) => r.code === c) || null;
check("products of an existing quote's lines, in line order", productsFromLines([{ productCode: "AMS04" }, { productCode: "OB04" }, { productCode: "AMS03" }, { productCode: "" }], byCode, catalog), ["AMSAir", "OrbisOne"]);
check("a row not linked to a product falls in Other", productIdOfRow({ code: "Q", name: "Quux" }, catalog), OTHER_GROUP);

check("a plan starts at its minimum users", lineForRow(byCode("OB04")), { productCode: "OB04", qty: 20, months: 12, discountPct: 0 });
check("a usage service has no quantity", lineForRow(byCode("AMS04")).qty, 0);
check("a one-time item starts at 1", lineForRow(byCode("AS03")).qty, 1);

check("item names lose the product prefix", [chipLabel(byCode("OB04"), "Orbis One"), chipLabel({ name: "Orbis One — CB Saathi AI Document Reading" }, "Orbis One"), chipLabel(byCode("AMS04"), "AMS - Air Consol")],
  ["Enterprise", "CB Saathi AI Document Reading", "Air Consol Filing"]);
check("a name equal to the product stays whole", chipLabel({ name: "WiseCargo" }, "WiseCargo"), "WiseCargo");

check("price hints by billing class", [rowPriceHint(byCode("OB04")), rowPriceHint(byCode("AMS04")), rowPriceHint({ listPrice: 450000, pricingModel: "Implementation" }), rowPriceHint({ listPrice: 27.5, unit: "HBL", pricingModel: "Per-transaction" })],
  ["₹4,199/User/mo", "₹30/HAWB", "₹4,50,000", "₹27.50/HBL"]);
check("a one-time charge per user names the unit; a fixed one does not", [rowPriceHint({ listPrice: 8000, unit: "User", pricingModel: "Implementation" }), rowPriceHint({ listPrice: 8000, unit: "Fixed", pricingModel: "Implementation" })], ["₹8,000/User", "₹8,000"]);
check("slab and rate-card rows say so / stay blank", [rowPriceHint({ rateSource: "Slab" }), rowPriceHint({ matrixId: "m1", listPrice: 5 }), rowPriceHint({ listPrice: null })], ["slab rates", "", ""]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// One product master: modules and price rows as one list of items.
import { itemsOf, linked, newItemCode, itemForm, itemProblems, saveItem, MODEL_FOR_CLASS } from "../src/lib/quotation/productItems.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const catalog = [
  { id: "OrbisOne", name: "Orbis One", modules: [{ id: "m1", name: "Enterprise", type: "Plan" }, { id: "m2", name: "Ocean Container Tracking", type: "Add-on" }, { id: "m3", name: "Mobile App", type: "Add-on" }] },
  { id: "iCAFFE", name: "iCAFFE", modules: [{ id: "i1", name: "OCR Engine", type: "Add-on" }] },
];
const rows = [
  { code: "OB04", productId: "OrbisOne", name: "Orbis One Enterprise", pricingModel: "SaaS Subscription", unit: "User", listPrice: 4199, rateSource: "Flat" },
  { code: "OB14", productId: "OrbisOne", name: "Orbis One — Ocean Container Tracking", pricingModel: "Per-transaction", unit: "Container", listPrice: 85, rateSource: "Flat" },
  { code: "OB12", productId: "OrbisOne", name: "Orbis One — Additional Cloud Storage", pricingModel: "Per-transaction", unit: "GB", listPrice: null, rateSource: "Flat" },
  { code: "P01", productId: "iCAFFE", name: "iCAFFE", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band" },
];
const ob = catalog[0];
const items = itemsOf(ob, rows, catalog);
check("price rows first, each with its module (product name ignored); then unpriced modules",
  items.map((i) => [i.row?.code || null, i.module?.id || null, i.priced]), [["OB04", "m1", true], ["OB14", "m2", true], ["OB12", null, false], [null, "m3", false]]);
check("rows priced by bands count as priced", itemsOf(catalog[1], rows, catalog).map((i) => [i.row?.code || null, i.module?.id || null, i.priced]), [["P01", null, true], [null, "i1", false]]);
check("an explicit link wins over names", [linked({ id: "m3" }, { moduleId: "m3", name: "x" }, ob), linked({ id: "m1", name: "Enterprise" }, { moduleId: "m9", name: "Orbis One Enterprise" }, ob), linked({ id: "m2", priceCode: "OB14" }, { code: "OB14" }, ob)], [true, false, true]);

check("new codes follow the product's prefix", [newItemCode(ob, rows, catalog), newItemCode({ id: "GateMgmt", name: "Gate Management" }, rows, catalog)], ["OB15", "GA01"]);
check("a new code never collides", newItemCode(ob, [...rows, { code: "OB15", productId: "Other" }], catalog), "OB16");

const form = itemForm(items[0], ob);
check("the editor shows the row's figures and the module's type", [form.name, form.type, form.billingClass, form.listPrice, form.oneTimeAllowed], ["Orbis One Enterprise", "Plan", "subscription", 4199, true]);
check("a module with no price opens as a subscription item to price", [itemForm(items[3], ob).name, itemForm(items[3], ob).type, itemForm(items[3], ob).listPrice], ["Mobile App", "Add-on", ""]);
check("problems are named", itemProblems({ name: "", unit: "", listPrice: "-1", maxDiscountPct: "150" }), ["Name is required.", "Pick the unit it is priced per.", "List price: a number of 0 or more.", "Max discount: 0 to 100."]);

let n = 0; const uid = () => `x${++n}`;
const add = saveItem({ ...itemForm(null, ob), name: "Live Tracking", type: "Subscription add-on", billingClass: "subscription", pricingModel: MODEL_FOR_CLASS.subscription, unit: "User", listPrice: "199", otMonths: "", otDiscountPct: "" },
  { item: null, product: ob, rows, catalog, uid });
check("a new item: price row and module, linked both ways", [add.row.code, add.row.productId, add.row.listPrice, add.row.itemType, add.row.moduleId, add.module.id, add.module.priceCode, add.module.type],
  ["OB15", "OrbisOne", 199, "Subscription add-on", "m_x1", "m_x1", "OB15", "Subscription add-on"]);
const priceIt = saveItem({ ...itemForm(items[3], ob), listPrice: "500" }, { item: items[3], product: ob, rows, catalog, uid });
check("pricing a module keeps the module's id", [priceIt.module.id, priceIt.row.moduleId, priceIt.row.listPrice], ["m3", "m3", 500]);
const edit = saveItem({ ...itemForm(items[0], ob), listPrice: "4299", oneTimeAllowed: false }, { item: items[0], product: ob, rows, catalog, uid });
check("editing keeps the code and every other field; one-time can be refused", [edit.row.code, edit.row.minQty, edit.row.listPrice, edit.row.oneTimeAllowed, edit.row.moduleId], ["OB04", null, 4299, false, "m1"]);
const band = saveItem({ ...itemForm({ row: rows[3] }, catalog[1]), listPrice: "999" }, { item: { row: rows[3] }, product: catalog[1], rows, catalog, uid });
check("a band-priced row keeps its rate source (no flat price slipped in)", [band.row.rateSource, band.row.listPrice], ["Band", null]);
const usage = saveItem({ ...itemForm(items[1], ob), oneTimeAllowed: true, otMonths: "30" }, { item: items[1], product: ob, rows, catalog, uid });
check("usage items are never sold one-time", [usage.row.oneTimeAllowed, usage.row.otMonths], [false, null]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

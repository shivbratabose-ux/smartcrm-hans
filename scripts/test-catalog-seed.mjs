// Product Catalogue seed merge. Run: node scripts/test-catalog-seed.mjs
import { mergeCatalogSeed, INIT_PRODUCT_CATALOG } from "../src/data/seed.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const seedAms = INIT_PRODUCT_CATALOG.find((p) => p.id === "AMSOcean");
check("AMS Ocean card lists registration + slab pricing", seedAms.modules.map((m) => m.desc.slice(0, 14)), ["₹5,000 one tim", "Slab on the mo"]);
check("AMS Air card lists registration + ₹30/HAWB", INIT_PRODUCT_CATALOG.find((p) => p.id === "AMSAir").modules.map((m) => m.desc), ["₹5,000 one time (covers Air and Ocean consol)", "₹30 per HAWB"]);

const stored = INIT_PRODUCT_CATALOG.map((p) => ({ ...p, modules: p.id.startsWith("AMS") && p.id !== "AMSIGM" ? [] : p.modules }));
const merged = mergeCatalogSeed(stored);
check("stored AMS products with no modules pick up the pricing", ["AMSOcean", "AMSAir"].map((id) => merged.find((p) => p.id === id).modules.length), [2, 2]);
const edited = INIT_PRODUCT_CATALOG.map((p) => (p.id === "AMSOcean" ? { ...p, modules: [{ id: "x", name: "Mine", type: "Core", desc: "" }] } : p));
check("modules the org entered are kept", mergeCatalogSeed(edited).find((p) => p.id === "AMSOcean").modules.map((m) => m.name), ["Mine"]);
check("nothing to change → same array (no save)", mergeCatalogSeed(INIT_PRODUCT_CATALOG) === INIT_PRODUCT_CATALOG, true);
const other = stored.map((p) => (p.id === "OrbisOne" ? { ...p, name: "Orbis One", desc: "edited" } : p));
check("other products untouched", mergeCatalogSeed(other).find((p) => p.id === "OrbisOne").desc, "edited");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

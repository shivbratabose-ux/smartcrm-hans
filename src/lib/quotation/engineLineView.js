// How a pricing-engine quote line (quote.hans set) reads in the quotation
// register's line-item table. Engine lines store productCode / name /
// unitPriceResolved / discountPct / lineTotal, not the Custom Quote fields
// (chargeName / mrp / unitPrice / amount) that table was written for, so
// without this the table showed every engine line as ₹0 with no name.
//
// Values only; no new calculation. GST is charged on the quote total
// (hans.cgst / sgst / igst), so it is not split per line here.
import { billingClassOf } from "./commercial.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;

/** One engine line → the register table's columns. */
export function engineLineView(item = {}) {
  const cls = billingClassOf(item);
  const list = num(item.unitPriceResolved);
  const disc = num(item.discountPct);
  const agreed = round2(list * (1 - disc / 100));
  const unit = String(item.unit || "").trim();
  const base = {
    billingClass: cls,
    charge: item.productCode || "",
    name: item.name || item.productCode || "",
    description: item.description || "",
    mrp: list,
    discountPct: disc,
    price: agreed,
    unit,
  };
  if (cls === "transaction") {
    const min = num(item.monthlyMinimum);
    return {
      ...base,
      qtyText: "On use",
      priceText: unit ? `per ${unit}` : "per use",
      taxable: num(item.lineTotal),
      total: num(item.lineTotal),
      note: min > 0 ? `Billed monthly on actual use; minimum ₹${min.toLocaleString("en-IN")} per month` : "Billed monthly on actual use",
      minimumPerMonth: min,
    };
  }
  if (cls === "one_time") {
    return { ...base, qtyText: String(num(item.qty)), priceText: "", taxable: num(item.lineTotal), total: num(item.lineTotal), note: "One time" };
  }
  const months = num(item.months);
  return {
    ...base,
    qtyText: months ? `${num(item.qty)} × ${months} mo` : String(num(item.qty)),
    priceText: unit ? `per ${unit} / month` : "per month",
    taxable: num(item.lineTotal),
    total: num(item.lineTotal),
    note: "",
  };
}

/** GST of an engine quote, from its stored breakdown (absolute ₹). */
export function engineGst(quote) {
  const h = quote?.hans || {};
  return { igst: num(h.igst), cgst: num(h.cgst), sgst: num(h.sgst) };
}

/** Catalogue products on an engine quote's lines (for the Products panel), in line order. */
export function engineProductIds(quote, priceRows = [], catalog = [], groupOf) {
  const ids = [];
  for (const it of quote?.items || []) {
    const row = priceRows.find((r) => r.code === it.productCode) || { name: it.name, module: it.module };
    const id = groupOf ? groupOf(row, catalog) : "";
    if (id && catalog.some((p) => p.id === id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

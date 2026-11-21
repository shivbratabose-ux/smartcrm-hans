// ═══════════════════════════════════════════════════════════════════
// QuotationMasters — admin editor for the quotation pricing masters
// ═══════════════════════════════════════════════════════════════════
// Phase D of the Quotation Module brief. Edits Config, Product Catalogue
// rates, Pricing Bands, the iCAFFE rate-card matrix, and Terms. Stored
// under masters.quotation and persisted via the existing saveSettings
// (Masters "Push to Cloud" / auto-save) — no new persistence layer, no
// hard-coded rates anywhere else (brief §13).
//
// Role-gated by the caller (admin only). Inline CC03 > CC04 validation
// blocks an invalid rate card (brief §9).
// ═══════════════════════════════════════════════════════════════════

import QuoteDocumentsMaster from "./QuoteDocumentsMaster";
import QuoteTermsMaster from "./QuoteTermsMaster";
import { resolveTermSets } from "../lib/quotation/termSets";
import { useState, useRef } from "react";
import { AlertTriangle, RotateCcw, Clock, Plus, Trash2, X, Tag, Globe, Download, Upload } from "lucide-react";
import {
  QUOTE_CONFIG, HANS_CATALOGUE, PRICING_BANDS, ICAFFE_EDITIONS,
  ICAFFE_BAND_LABELS, ICAFFE_BAND_FROM, QUOTE_TERMS, QUOTE_SEGMENTS, PRICING_MODELS, QUOTE_UNITS,
} from "../data/quotationMasters";

const RATE_SOURCES = ["Flat", "Band", "iCAFFE", "Slab"];
import { validateCcsRule } from "../lib/quotation/pricingEngine";
import { normalizeSlabs, slabLabel, slabProblems, usagePrice, hasUsageRules, escalatedRates } from "../lib/quotation/slabs";
import { isOneTimeModel } from "../lib/quotation/pricingEngine";
import { billingClassOf, productCommercialModel, approvalLevels, DEFAULT_APPROVAL_LEVELS, hansHostedProducts } from "../lib/quotation/commercial";
import { canEditPricing } from "../lib/quotation/priceHistory";
import { saleTerms, saleTermsProblems } from "../lib/quotation/saleTerms";
import PriceHistory from "./PriceHistory";
import { groupRates, groupOf, productsToAdd, SERVICES_GROUP, SERVICES_LABEL } from "../lib/quotation/productGroups";
import { COMPANY_DEFAULTS } from "../lib/quotation/company";
import { OFFICE_CODES_DEFAULT, fyCompact } from "../lib/quotation/docNumbers";
import { fiscalYearSuffix } from "../lib/quotation/pricingEngine";
import { INIT_ORG } from "../data/seed";
import { exportCSV, parseCSV } from "../utils/csv";

// Columns for catalogue CSV round-trip (identifiers + the simple editable
// numeric/flag fields; nested schedule/segment/currency stay in the UI).
const CATALOGUE_CSV_COLS = [
  { key: "code", label: "Code" }, { key: "name", label: "Name" },
  { key: "pricingModel", label: "Pricing model" }, { key: "unit", label: "Unit" },
  { key: "rateSource", label: "Rate source" },
  { key: "listPrice", label: "List price" }, { key: "costPrice", label: "Cost" },
  { key: "minMonthFloor", label: "Floor per month" },
  { key: "minQty", label: "Min qty" }, { key: "maxDiscountPct", label: "Max discount %" },
  { key: "active", label: "Active", accessor: p => p.active !== false },
];

// Admin-editable fields overlaid from a saved catalogue row onto the seed
// structure. Structural fields (name, module, pricingModel, unit, rateSource)
// always come from the seed/code, so new products and rate-source changes
// ship without an admin reset; entered rates/overrides are preserved.
const CATALOGUE_OVERLAY_FIELDS = [
  // Descriptors an admin edits here must survive a reload too (they used to
  // fall back to the built-in list — e.g. E-Annex set to One-time Licence).
  "name", "module", "description", "pricingModel", "unit", "rateSource",
  "listPrice", "costPrice", "minMonthFloor", "minQty", "maxDiscountPct", "active", "notes",
  "productId", // which Product Catalogue product the row belongs to (one product master)
  "amcPct",    // AMC % for a one-time licence row (blank = the default in Quotation Rules)
  "amcFixed",  // or a fixed AMC in ₹ per unit per year (e.g. E-Annex ₹10,000 per branch)
  "rateSchedule", "segmentPrices", "currencyPrices", "bandRates",
  "matrixId", "matrixRow", // rate-card attachment (Phase 2e)
  "slabs",     // volume slabs for rateSource "Slab" [{ from, rate }]
  // usage pricing (lib/quotation/slabs.js): slab type / period, prepaid pack,
  // monthly minimum, pooled volume, yearly escalation
  "slabMode", "slabPeriod", "packQty", "packPrice", "monthlyMinimum", "pool", "escalationPct",
  "billingClass", // subscription | transaction (lib/quotation/commercial.js); one-time follows the pricing model
  // One product master (lib/quotation/productItems.js) and how it is sold (lib/quotation/saleTerms.js)
  "moduleId", "itemType", "oneTimeAllowed", "otMonths", "otDiscountPct",
  // Structural fields are now admin-editable too, so they overlay the seed.
  "name", "module", "pricingModel", "unit", "rateSource",
];

// Merge the quotation price book onto the seed, then UNION in the Product
// Catalogue master so it's the single product list (auto-sync, keep price
// book). seed = structure, saved = rates; any master product not already
// priced is added as a default Flat row to price (engine unchanged).
function mergeCatalogue(saved, appCatalog) {
  const savedByCode = new Map((saved || []).map(p => [p.code, p]));
  const overlay = (base) => {
    const sv = savedByCode.get(base.code);
    if (!sv) return base;
    const out = { ...base };
    for (const f of CATALOGUE_OVERLAY_FIELDS) if (f in sv) out[f] = sv[f];
    return out;
  };
  const merged = HANS_CATALOGUE.map(overlay);
  // Saved-only custom products not in the seed.
  // A saved placeholder for a Product Catalogue product (code = product id)
  // is superseded once built-in rows price that product (e.g. AMSOcean after
  // AMS01–AMS04): it stays for old quotes but is never active again.
  const seededProducts = new Set(HANS_CATALOGUE.map(s => s.productId).filter(Boolean));
  (saved || []).forEach(sv => {
    if (HANS_CATALOGUE.some(s => s.code === sv.code)) return;
    const row = overlay(sv);
    merged.push(seededProducts.has(sv.code) && !sv.productId ? { ...row, active: false, _superseded: true } : row);
  });
  // Union in Product Catalogue master products not already represented
  // (by code or name) — adding once in Product Catalogue surfaces it here.
  const norm = (s) => (s || "").trim().toLowerCase();
  const have = new Set(merged.map(p => norm(p.name)));
  const haveCodes = new Set(merged.map(p => p.code));
  // Products priced as a family of rows (e.g. Orbis One's plans, installation
  // and add-ons all carry productId "OrbisOne") are already represented.
  const haveProductIds = new Set(merged.map(p => p.productId).filter(Boolean));
  (appCatalog || []).forEach(ap => {
    if (!ap || !ap.id || haveCodes.has(ap.id) || haveProductIds.has(ap.id) || have.has(norm(ap.name))) return;
    const base = {
      code: ap.id, name: ap.name || ap.id, module: ap.desc || "From Product Catalogue",
      pricingModel: "SaaS Subscription", unit: "User", listPrice: null,
      rateSource: "Flat", minMonthFloor: null, notes: "From Product Catalogue", active: true,
      _fromCatalog: true,
    };
    merged.push(overlay(base));
    have.add(norm(base.name)); haveCodes.add(base.code);
  });
  return merged;
}

// Pick people from the active users (approvers, Accounts team).
function PeoplePicker({ label, hint, orgUsers, value, onChange }) {
  const live = (orgUsers || []).filter(u => u && u.active !== false && !u.isDeleted && String(u.status || "Active").toLowerCase() !== "inactive")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const chosen = new Set(value);
  const known = new Set(live.map(u => u.id));
  const missing = value.filter(id => !known.has(id));
  return (
    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
      <label>{label} {value.length ? <span style={{ color: "var(--text3)", fontWeight: 500 }}>· {value.length} selected</span> : <span style={{ color: "#B45309", fontWeight: 500 }}>· none — default rule applies</span>}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8, border: "1.5px solid var(--border)", borderRadius: 8, background: "#fff", maxHeight: 150, overflowY: "auto" }}>
        {live.map(u => (
          <button key={u.id} type="button" onClick={() => onChange(chosen.has(u.id) ? value.filter(x => x !== u.id) : [...value, u.id])}
            style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 14, cursor: "pointer", border: `1.5px solid ${chosen.has(u.id) ? "#1B6B5A" : "var(--border)"}`, background: chosen.has(u.id) ? "#E6F4EF" : "#fff", color: chosen.has(u.id) ? "#1B6B5A" : "var(--text2)", fontWeight: chosen.has(u.id) ? 700 : 500 }}>
            {chosen.has(u.id) ? "✓ " : ""}{u.name || u.email || u.id}<span style={{ color: "var(--text3)", fontWeight: 400 }}> · {u.role || ""}</span>
          </button>
        ))}
        {live.length === 0 && <span style={{ fontSize: 11.5, color: "var(--text3)" }}>No users loaded.</span>}
      </div>
      {missing.length > 0 && <div style={{ fontSize: 11, color: "#B45309", marginTop: 4 }}>{missing.length} selected user(s) are no longer active and are ignored. <button type="button" className="btn btn-xs btn-sec" onClick={() => onChange(value.filter(id => known.has(id)))}>Remove</button></div>}
      {hint && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// Resolve current masters with seeded fallbacks. `catalog` is the Product
// Catalogue master (the single product list) unioned into the price book.
export function resolveQuotationMasters(masters, catalog) {
  const qm = (masters && masters.quotation) || {};
  return {
    quoteConfig: { ...QUOTE_CONFIG, ...(qm.quoteConfig || {}) },
    catalogue: mergeCatalogue(qm.catalogue, catalog),
    bands: qm.bands && qm.bands.length ? qm.bands : PRICING_BANDS,
    editions: qm.editions && qm.editions.length ? qm.editions : ICAFFE_EDITIONS,
    rateCards: Array.isArray(qm.rateCards) ? qm.rateCards : [],
    terms: qm.terms && qm.terms.length ? qm.terms : QUOTE_TERMS,
    termSets: resolveTermSets(masters),
  };
}

// Match the app's .tbl tables (row-separated, not full-grid borders) and its
// bordered form inputs, so the masters editors look native to the app.
const cell = { padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 12.5, verticalAlign: "middle" };
const numInput = { width: "100%", border: "1.5px solid var(--border)", borderRadius: 6, background: "white", fontSize: 12, padding: "5px 7px", textAlign: "right", fontFamily: "'Outfit',sans-serif", outline: "none", boxSizing: "border-box" };

// mode "rules": Quotation Rules (config, bands, rate cards, terms, documents).
// mode "rates": the price rows, grouped by product, shown on Products & Pricing.
export default function QuotationMasters({ masters, setMasters: setMastersProp, catalog = [], orgUsers = [], currentUser = null, mode = "rules", onOpenRates, onAddProducts, focusProduct = "", setFocusProduct }) {
  // Pricing owners (Quotation Rules → Config): when named, only they, Admin and
  // MD change prices and rules. The database enforces the same rule
  // (supabase/commercial_phase_b_v1.sql); here the screen is simply read-only.
  const meUser = orgUsers.find(u => u.id === currentUser) || null;
  const pricingAllowed = !currentUser || canEditPricing(resolveQuotationMasters(masters, catalog).quoteConfig, meUser);
  const setMasters = pricingAllowed ? setMastersProp : () => {};
  const [showHistory, setShowHistory] = useState(false);
  const cur = resolveQuotationMasters(masters, catalog);
  const [subState, setSub] = useState("config");
  const sub = mode === "rates" ? "catalogue" : subState;
  // Rates live on Products & Pricing: send "go to rates" links there.
  const goSub = (t) => { if (t === "catalogue" && mode === "rules" && onOpenRates) onOpenRates(); else setSub(t); };
  const [prodFilterState, setProdFilterState] = useState("");
  const prodFilter = setFocusProduct ? focusProduct : prodFilterState;
  const setProdFilter = setFocusProduct || setProdFilterState;
  const [schedFor, setSchedFor] = useState(null); // {kind,key} whose rate schedule is open
  const [slabFor, setSlabFor] = useState(null);   // price-row code whose usage pricing is open
  const [usageQty, setUsageQty] = useState(300);   // preview volume in the usage-pricing editor
  const [segFor, setSegFor] = useState(null); // product code whose segment prices are open
  const [curFor, setCurFor] = useState(null); // product code whose currency prices are open
  const [bandProd, setBandProd] = useState(""); // Band product for per-product/country rates
  const [bandCountry, setBandCountry] = useState("Default");
  const [newCountry, setNewCountry] = useState("");
  // Rate Cards tab UI state
  const [cardId, setCardId] = useState("");
  const [cardCountry, setCardCountry] = useState("Default");
  const [newCardLabel, setNewCardLabel] = useState("");
  const [newRowName, setNewRowName] = useState("");
  const [newRowProduct, setNewRowProduct] = useState("");
  const [newInlineRow, setNewInlineRow] = useState(""); // free-typed new sub-product
  const [newCardCountry, setNewCardCountry] = useState("");
  const [importMsg, setImportMsg] = useState(null); // catalogue CSV import summary
  const fileRef = useRef(null);

  // Bulk catalogue CSV: export the current rates, or import to update list
  // price / cost / floor / active by Code (merge — unmatched codes ignored).
  const exportCatalogue = () => exportCSV(cur.catalogue, CATALOGUE_CSV_COLS, "quotation_catalogue");
  const importCatalogue = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(reader.result);
      const byCode = new Map(rows.filter(r => r.Code).map(r => [r.Code.trim().toUpperCase(), r]));
      let updated = 0;
      const numOr = (v, fallback) => { const s = String(v ?? "").trim(); if (s === "") return fallback; const n = Number(s); return Number.isFinite(n) ? n : fallback; };
      const next = cur.catalogue.map(p => {
        const r = byCode.get(String(p.code).toUpperCase());
        if (!r) return p;
        updated++;
        const out = { ...p };
        if ("List price" in r) out.listPrice = r["List price"].trim() === "" ? null : numOr(r["List price"], p.listPrice);
        if ("Cost" in r) out.costPrice = r["Cost"].trim() === "" ? null : numOr(r["Cost"], p.costPrice);
        if ("Floor per month" in r) out.minMonthFloor = r["Floor per month"].trim() === "" ? null : numOr(r["Floor per month"], p.minMonthFloor);
        if ("Min qty" in r) out.minQty = r["Min qty"].trim() === "" ? null : numOr(r["Min qty"], p.minQty);
        if ("Max discount %" in r) out.maxDiscountPct = r["Max discount %"].trim() === "" ? null : numOr(r["Max discount %"], p.maxDiscountPct);
        if ("Active" in r) out.active = !/^(false|no|0)$/i.test(r["Active"].trim());
        return out;
      });
      writeQ({ catalogue: next });
      setImportMsg({ matched: updated, rows: rows.length });
    };
    reader.readAsText(file);
  };

  // Write a slice back into masters.quotation (merging with current resolved set).
  const writeQ = (patch) => setMasters(m => ({ ...m, quotation: { ...cur, ...(m?.quotation || {}), ...patch } }));

  const setConfig = (key, val) => writeQ({ quoteConfig: { ...cur.quoteConfig, [key]: val } });
  const setCatRow = (code, key, val) => writeQ({ catalogue: cur.catalogue.map(p => p.code === code ? { ...p, [key]: val } : p) });
  const setBandRate = (band, val) => writeQ({ bands: cur.bands.map(b => b.band === band ? { ...b, ratePerUserMonth: val } : b) });
  const setEditionRate = (name, idx, val) => writeQ({ editions: cur.editions.map(e => e.name === name ? { ...e, rates: e.rates.map((r, i) => i === idx ? val : r) } : e) });
  const setBandSchedule = (band, arr) => writeQ({ bands: cur.bands.map(b => b.band === band ? { ...b, rateSchedule: arr } : b) });
  // Per-product, per-country band rate (Phase 2d): product.bandRates =
  // { Default: [r…], <Country>: [r…] } aligned to the band order.
  const setProductBandRate = (code, country, idx, val) => writeQ({ catalogue: cur.catalogue.map(p => {
    if (p.code !== code) return p;
    const map = { ...(p.bandRates || {}) };
    const row = Array.isArray(map[country]) ? [...map[country]] : cur.bands.map(() => null);
    row[idx] = val;
    map[country] = row;
    return { ...p, bandRates: map };
  }) });
  const setEditionSchedule = (name, arr) => writeQ({ editions: cur.editions.map(e => e.name === name ? { ...e, rateSchedule: arr } : e) });
  // ── Generic rate cards (Phase 2e+) ──
  // Each card carries its OWN columns/tiers (card.bands = [{label, from}]) and
  // a unitLabel ("priced by"). Legacy cards without bands fall back to the
  // shared iCAFFE bands so nothing already saved breaks.
  const cardBands = (card) => (Array.isArray(card?.bands) && card.bands.length)
    ? card.bands
    : ICAFFE_BAND_LABELS.map((label, i) => ({ label, from: ICAFFE_BAND_FROM[i] }));
  const setRateCards = (arr) => writeQ({ rateCards: arr });
  const addRateCard = (label) => setRateCards([...(cur.rateCards), {
    id: `rc_${Date.now().toString(36)}`, label, unitLabel: "Users",
    bands: [{ label: "Tier 1", from: 0 }], rows: [], rates: { Default: {} },
  }]);
  const updateCard = (id, patch) => setRateCards(cur.rateCards.map(c => c.id === id ? { ...c, ...patch } : c));
  const setMatrixCell = (cardId, country, rowName, idx, val) => setRateCards(cur.rateCards.map(c => {
    if (c.id !== cardId) return c;
    const rates = { ...(c.rates || {}) };
    const ctry = { ...(rates[country] || {}) };
    const row = Array.isArray(ctry[rowName]) ? [...ctry[rowName]] : cardBands(c).map(() => null);
    row[idx] = val; ctry[rowName] = row; rates[country] = ctry;
    return { ...c, rates };
  }));
  // Column (tier) editing — add appends a null cell to every row, remove
  // splices that index out of every row across all countries so rates stay
  // aligned with the columns.
  const addCardColumn = (cardId) => setRateCards(cur.rateCards.map(c => c.id === cardId
    ? { ...c, bands: [...cardBands(c), { label: `Tier ${cardBands(c).length + 1}`, from: 0 }] } : c));
  const editCardColumn = (cardId, idx, patch) => setRateCards(cur.rateCards.map(c => {
    if (c.id !== cardId) return c;
    return { ...c, bands: cardBands(c).map((b, i) => i === idx ? { ...b, ...patch } : b) };
  }));
  const removeCardColumn = (cardId, idx) => setRateCards(cur.rateCards.map(c => {
    if (c.id !== cardId) return c;
    const bands = cardBands(c).filter((_, i) => i !== idx);
    const rates = {};
    Object.entries(c.rates || {}).forEach(([ctry, rows]) => {
      const nr = {};
      Object.entries(rows || {}).forEach(([rn, arr]) => { nr[rn] = (Array.isArray(arr) ? arr : []).filter((_, i) => i !== idx); });
      rates[ctry] = nr;
    });
    return { ...c, bands, rates };
  }));
  // Attach/detach a catalogue product to a card row — sets the product's
  // matrixId/matrixRow so the engine prices it from the card (one writeQ).
  const attachProductToRow = (cardId, rowName, productCode) => {
    setMasters(m => {
      const q = { ...cur, ...(m?.quotation || {}) };
      const rateCards = (q.rateCards || cur.rateCards).map(c => c.id === cardId
        ? { ...c, rows: [...(c.rows || []), { name: rowName, productCode }] } : c);
      const catalogue = (q.catalogue || cur.catalogue).map(p => p.code === productCode
        ? { ...p, matrixId: cardId, matrixRow: rowName } : p);
      return { ...m, quotation: { ...q, rateCards, catalogue } };
    });
  };
  // Add a sub-product row by typing a new name — auto-creates a catalogue
  // product attached to the card (no need to pre-create it in Product
  // Catalogue). Code is derived from the card label + a counter, unique
  // against the existing catalogue.
  const addInlineRow = (cardId, rawName) => {
    const name = (rawName || "").trim();
    if (!name) return;
    setMasters(m => {
      const q = { ...cur, ...(m?.quotation || {}) };
      const cat = q.catalogue || cur.catalogue;
      const card = (q.rateCards || cur.rateCards).find(c => c.id === cardId);
      if (!card) return m;
      // Don't create a duplicate row name within the same card.
      if ((card.rows || []).some(r => r.name.trim().toLowerCase() === name.toLowerCase())) return m;
      const unit = card.unitLabel || "User";
      const prefix = (card.label || "RC").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "RC";
      const codes = new Set(cat.map(p => p.code));
      let n = 1, code = `${prefix}${String(n).padStart(2, "0")}`;
      while (codes.has(code)) { n++; code = `${prefix}${String(n).padStart(2, "0")}`; }
      const newProd = {
        code, name, module: card.label || "Rate card", description: "From rate card",
        pricingModel: "SaaS Subscription", unit, listPrice: null, rateSource: "Flat",
        minMonthFloor: null, notes: "Priced from rate card", active: true,
        matrixId: cardId, matrixRow: name, _inline: true,
      };
      const catalogue = [...cat, newProd];
      const rateCards = (q.rateCards || cur.rateCards).map(c => c.id === cardId
        ? { ...c, rows: [...(c.rows || []), { name, productCode: code }] } : c);
      return { ...m, quotation: { ...q, catalogue, rateCards } };
    });
  };
  const removeRow = (cardId, rowName) => {
    setMasters(m => {
      const q = { ...cur, ...(m?.quotation || {}) };
      let removedCode = null;
      const rateCards = (q.rateCards || cur.rateCards).map(c => {
        if (c.id !== cardId) return c;
        const r = (c.rows || []).find(x => x.name === rowName);
        if (r) removedCode = r.productCode;
        const rates = { ...(c.rates || {}) };
        Object.keys(rates).forEach(ctry => { const rr = { ...rates[ctry] }; delete rr[rowName]; rates[ctry] = rr; });
        return { ...c, rows: (c.rows || []).filter(x => x.name !== rowName), rates };
      });
      let catalogue = (q.catalogue || cur.catalogue).map(p =>
        (p.matrixId === cardId && p.matrixRow === rowName) ? { ...p, matrixId: undefined, matrixRow: undefined } : p);
      // Inline-created sub-products exist only for the card — drop them entirely
      // on removal so they don't linger as unpriced Flat products.
      catalogue = catalogue.filter(p => !(p.code === removedCode && p._inline));
      return { ...m, quotation: { ...q, rateCards, catalogue } };
    });
  };
  const setTerm = (key, text) => writeQ({ terms: cur.terms.map(t => t.key === key ? { ...t, text } : t) });

  const ccs = validateCcsRule(cur.catalogue);

  const numOrNull = (v) => v === "" ? null : Number(v);

  // ── Masters health / coverage — surface the gaps centrally instead of
  //    only discovering them when a rep builds a quote. ──
  // A Flat product with listPrice === 0 is a deliberate "inclusive / at
  // actuals" rate, not a gap. Band/iCAFFE products price from their own tabs.
  const flatActive = cur.catalogue.filter(p => p.rateSource === "Flat" && p.active !== false && !p.matrixId);
  const flatMissing = flatActive.filter(p => p.listPrice == null);
  const bandsTotal = cur.bands.length;
  const bandsFilled = cur.bands.filter(b => b.ratePerUserMonth != null).length;
  const usesBand = cur.catalogue.some(p => p.rateSource === "Band" && p.active !== false);
  const icaffeCells = cur.editions.reduce((s, e) => s + e.rates.length, 0);
  const icaffeFilled = cur.editions.reduce((s, e) => s + e.rates.filter(r => r != null).length, 0);
  // Per-product coverage status (drives the catalogue Status chips).
  const rowStatus = (p) => {
    if (p.matrixId) return { label: "From rate card", c: "#1E40AF", bg: "#EFF6FF" };
    if (p.rateSource === "Band") return usesBand && bandsFilled < bandsTotal ? { label: "Needs bands", c: "#B45309", bg: "#FFFBEB" } : { label: "From bands", c: "#1E40AF", bg: "#EFF6FF" };
    if (p.rateSource === "iCAFFE") return icaffeFilled < icaffeCells ? { label: "Rate card gaps", c: "#B45309", bg: "#FFFBEB" } : { label: "From rate card", c: "#1E40AF", bg: "#EFF6FF" };
    if (p.listPrice == null) return { label: "Rate missing", c: "#B91C1C", bg: "#FEF2F2" };
    if (Number(p.listPrice) === 0) return { label: "Inclusive", c: "#64748B", bg: "#F1F5F9" };
    return { label: "Priced", c: "#15803D", bg: "#F0FDF4" };
  };
  const healthChip = (label, ok, detail, tab) => (
    <button type="button" onClick={() => tab && goSub(tab)} title={tab ? "Go to tab" : ""}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ok ? "#A7F3D0" : "#FDE68A"}`, background: ok ? "#F0FDF4" : "#FFFBEB", cursor: tab ? "pointer" : "default", fontSize: 11.5 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? "#22C55E" : "#F59E0B" }} />
      <span style={{ fontWeight: 700, color: "var(--text2)" }}>{label}</span>
      <span style={{ color: "var(--text3)" }}>{detail}</span>
    </button>
  );

  const SUBS = [
    { id: "config", label: "Config" },
    { id: "bands", label: "Pricing Bands" },
    { id: "icaffe", label: "iCAFFE Rate Card" },
    { id: "ratecards", label: "Rate Cards" },
    { id: "terms", label: "Terms & EULA" },
    { id: "documents", label: "Documents (ULA / Agreement)" },
  ];

  return (
    <div>
      {showHistory && <PriceHistory orgUsers={orgUsers} onClose={() => setShowHistory(false)} />}
      {!pricingAllowed && (
        <div style={{ fontSize: 12.5, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
          <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> Prices and quotation rules are read-only for you. Pricing owners: {(cur.quoteConfig.pricingOwnerIds || []).map(id => orgUsers.find(u => u.id === id)?.name || id).join(", ")} (and Admin / MD). Changes you make here are not saved.
        </div>
      )}
      {/* Secondary (underline) tabs — visually subordinate to the top group
          tabs so the two rows don't read as duplicate tab bars. */}
      {mode === "rules" && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap", gap: 8, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 2 }}>
          {SUBS.map(s => (
            <button key={s.id} onClick={() => setSub(s.id)}
              style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: sub === s.id ? 700 : 500, cursor: "pointer", background: "none", border: "none",
                color: sub === s.id ? "var(--brand)" : "var(--text3)",
                borderBottom: sub === s.id ? "2px solid var(--brand)" : "2px solid transparent" }}>
              {s.label}
            </button>
          ))}
        </div>
        <button className="btn btn-sec btn-xs" style={{ marginBottom: 6 }} onClick={() => { if (window.confirm("Reset quotation masters to the workbook defaults?")) setMasters(m => ({ ...m, quotation: undefined })); }}>
          <RotateCcw size={12} /> Reset to defaults
        </button>
      </div>}

      {/* ── Masters health / coverage strip ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)" }}>Pricing coverage</span>
        {healthChip("Catalogue", flatMissing.length === 0, `${flatActive.length - flatMissing.length}/${flatActive.length} flat rates`, "catalogue")}
        {mode === "rules" && healthChip("Pricing bands", !usesBand || bandsFilled === bandsTotal, `${bandsFilled}/${bandsTotal} filled`, "bands")}
        {mode === "rules" && healthChip("iCAFFE rate card", icaffeFilled === icaffeCells, `${icaffeFilled}/${icaffeCells} cells`, "icaffe")}
        {healthChip("CC03 > CC04", ccs.ok, ccs.ok ? "valid" : "invalid", "catalogue")}
      </div>

      {flatMissing.length > 0 && sub !== "catalogue" && (
        <div style={{ fontSize: 12, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          {flatMissing.length} product{flatMissing.length > 1 ? "s" : ""} need a list price before they can be quoted (e.g. {flatMissing.slice(0, 3).map(p => p.code).join(", ")}{flatMissing.length > 3 ? "…" : ""}). <button type="button" onClick={() => goSub("catalogue")} style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 700, cursor: "pointer", padding: 0 }}>Open prices in Products &amp; Pricing →</button>
        </div>
      )}

      {!ccs.ok && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
          <AlertTriangle size={15} /> {ccs.error} — fix before pushing to cloud.
        </div>
      )}

      {/* ── Config ── */}
      {sub === "config" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, maxWidth: 720 }}>
          {[
            ["homeState", "Home state (GST pivot)", "text"],
            ["gstRatePct", "GST rate %", "number"],
            ["maxUserDiscountPct", "Max discount % (approval)", "number"],
            ["amcDefaultPct", "AMC % of licence (default)", "number"],
            ["amcStartYear", "AMC starts in contract year", "number"],
            ["amcFixedYears", "AMC fixed for (years)", "number"],
            ["amcEscalationPct", "AMC increase %", "number"],
            ["amcEscalationEvery", "AMC increase every (years)", "number"],
            ["amcScheduleYears", "AMC years shown on quote", "number"],
            ["prepaymentDiscountPctDefault", "Default prepayment %", "number"],
            ["minMarginPct", "Min margin % (0 = off)", "number"],
            ["fx", "FX to INR (divisor)", "number"],
          ].map(([k, label, type]) => (
            <div className="form-group" key={k}>
              <label>{label}</label>
              <input type={type} value={cur.quoteConfig[k]} onChange={e => {
                const v = e.target.value;
                // Don't let an emptied field silently persist as 0 (which would
                // mean 0% GST / 0% discount cap). Keep the prior value when
                // cleared; typing "0" still sets 0 explicitly.
                setConfig(k, type === "number" ? (v === "" ? cur.quoteConfig[k] : Number(v)) : v);
              }} />
            </div>
          ))}
          <div className="form-group">
            <label>AMC calculated on</label>
            <select value={cur.quoteConfig.amcBase || "net"} onChange={e => setConfig("amcBase", e.target.value)}>
              <option value="net">Licence fee after discount</option>
              <option value="list">Listed licence fee, before any discount</option>
            </select>
          </div>
          {/* ── How software is sold (subscription frequencies, one-time licence) ── */}
          {(() => {
            const raw = cur.quoteConfig.saleTerms || {};
            const st = saleTerms(cur.quoteConfig);
            const write = (patch) => setConfig("saleTerms", { frequencies: st.frequencies.map(({ id, enabled, discountPct }) => ({ id, enabled, discountPct })), oneTime: st.oneTime, ...raw, ...patch });
            const setFreq = (id, p) => write({ frequencies: st.frequencies.map((f) => ({ id: f.id, enabled: f.enabled, discountPct: f.discountPct, ...(f.id === id ? p : {}) })) });
            const probs = saleTermsProblems({ ...st, ...raw });
            return (
              <div style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>How software is sold</div>
                <div style={{ fontSize: 11.5, color: "var(--text3)", margin: "2px 0 8px" }}>A subscription item can be quoted as a subscription billed at any allowed frequency, or as a one-time licence plus Annual Maintenance Charges (AMC), billed monthly (the AMC % and its increases are the AMC settings above). An item can refuse a one-time sale or set its own figures.</div>
                <table className="tbl" style={{ maxWidth: 520 }}>
                  <thead><tr><th>Subscription billed</th><th>Allowed</th><th style={{ textAlign: "right" }}>Discount %</th></tr></thead>
                  <tbody>{st.frequencies.map((f) => (
                    <tr key={f.id}><td>{f.label}</td>
                      <td><input type="checkbox" checked={f.enabled} onChange={(e) => setFreq(f.id, { enabled: e.target.checked })} /></td>
                      <td style={{ textAlign: "right" }}><input type="number" min={0} max={100} step="any" value={f.discountPct} style={{ width: 70, textAlign: "right" }} onChange={(e) => setFreq(f.id, { discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></td></tr>
                  ))}</tbody>
                </table>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12.5 }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={st.oneTime.enabled} onChange={(e) => write({ oneTime: { ...st.oneTime, enabled: e.target.checked } })} />One-time licence allowed</label>
                  <span>= monthly rate ×</span>
                  <input type="number" min={1} max={240} step={1} value={st.oneTime.months} style={{ width: 64, textAlign: "right" }} onChange={(e) => write({ oneTime: { ...st.oneTime, months: Math.max(1, Math.round(Number(e.target.value) || 1)) } })} />
                  <span>months ({+(st.oneTime.months / 12).toFixed(2)} years), less</span>
                  <input type="number" min={0} max={100} step="any" value={st.oneTime.discountPct} style={{ width: 64, textAlign: "right" }} onChange={(e) => write({ oneTime: { ...st.oneTime, discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } })} />
                  <span>%; then AMC {cur.quoteConfig.amcDefaultPct ?? 20}% of the licence a year from contract year {cur.quoteConfig.amcStartYear ?? 2}, billed monthly.</span>
                </div>
                {probs.length > 0 && <div style={{ color: "#B91C1C", fontSize: 12, marginTop: 6 }}>{probs.join(" ")}</div>}
              </div>
            );
          })()}
          {/* ── Quote numbers ── */}
          {(() => {
            const fy = fiscalYearSuffix(new Date());
            const codes = { ...OFFICE_CODES_DEFAULT, ...(cur.quoteConfig.quoteOfficeCodes || {}) };
            const branchIds = [...new Set([...(orgUsers || []).map(u => u.branchId).filter(Boolean), ...Object.keys(codes)])];
            const nameOf = (id) => INIT_ORG.branches.find(b => b.id === id)?.name || id;
            const office = cur.quoteConfig.quoteNumberFormat !== "classic";
            const starts = cur.quoteConfig.quoteOfficeStart || {};
            return (
              <div className="form-group" style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                <label>Quote numbers</label>
                <select value={office ? "office" : "classic"} onChange={e => setConfig("quoteNumberFormat", e.target.value)} style={{ maxWidth: 420 }}>
                  <option value="office">Office-wise — {codes.br2 || "DEL"}/SQ/0001/{fyCompact(fy)}</option>
                  <option value="classic">Company-wide — {cur.quoteConfig.quoteNumberPrefix}000001/{fy}</option>
                </select>
                {office && (
                  <table style={{ borderCollapse: "collapse", marginTop: 8, fontSize: 12 }}>
                    <thead><tr>{["Branch", "Office code", `Continue from (FY ${fy})`].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textAlign: "left", color: "var(--text3)" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {branchIds.map(id => (
                        <tr key={id}>
                          <td style={cell}>{nameOf(id)}{(orgUsers || []).some(u => u.branchId === id) ? "" : <span style={{ color: "var(--text3)" }}> · no users</span>}</td>
                          <td style={cell}><input style={{ ...numInput, width: 70, textAlign: "left", textTransform: "uppercase" }} value={codes[id] || ""} maxLength={5}
                            onChange={e => setConfig("quoteOfficeCodes", { ...(cur.quoteConfig.quoteOfficeCodes || {}), [id]: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} /></td>
                          <td style={cell}><input style={{ ...numInput, width: 90 }} type="number" min={1} placeholder="1" title="The next quote number for this office will be at least this — use it to carry on from the old system"
                            value={starts[`${codes[id]}:${fy}`] ?? ""} onChange={e => { const v = e.target.value; const k = `${codes[id]}:${fy}`; const nx = { ...starts }; if (v === "") delete nx[k]; else nx[k] = Number(v); setConfig("quoteOfficeStart", nx); }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>A quote takes the office of the rep who creates it (Team &amp; Users → branch). Each office counts separately per financial year.</div>
              </div>
            );
          })()}

          {/* ── Company & bank details (letterhead, bills) ── */}
          {(() => {
            const co = cur.quoteConfig.company || {};
            const setCo = (k, v) => setConfig("company", { ...co, [k]: v });
            const F = [
              ["name", "Company name"], ["regdOffice", "Registered office"], ["headOffice", "Head office"], ["otherOffices", "Other offices"],
              ["email", "E-mail"], ["website", "Website"], ["certifications", "Certifications line"], ["signatoryName", "Signatory on quotes"],
              ["signatoryTitle", "Signatory designation"], ["cin", "CIN"], ["gstin", "GSTIN"], ["pan", "PAN"], ["msme", "MSME Reg. no."], ["sac", "SAC code (software)"],
              ["bankAccountName", "Bank A/c name"], ["bankName", "Bank"], ["bankAccount", "Bank A/c no."], ["bankIfsc", "RTGS / NEFT / IFSC"], ["bankMicr", "MICR"], ["bankBranch", "Bank address"],
            ];
            return (
              <div style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>Company &amp; bank details</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8 }}>Printed on quotes, the Accounts pack and the customer's bill page. Empty boxes use the standard wording; CIN, GSTIN, PAN and bank details print only once entered here.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
                  {F.map(([k, label]) => (
                    <div className="form-group" key={k} style={{ margin: 0 }}>
                      <label>{label}</label>
                      <input value={co[k] ?? ""} placeholder={COMPANY_DEFAULTS[k] || ""} onChange={e => setCo(k, e.target.value)} />
                    </div>
                  ))}
                  <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                    <label>Cover letter (first page of a quote)</label>
                    <textarea rows={3} value={co.coverLetter ?? ""} placeholder={COMPANY_DEFAULTS.coverLetter} onChange={e => setCo("coverLetter", e.target.value)} />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                    <label>Note on bills</label>
                    <input value={co.billNote ?? ""} placeholder={COMPANY_DEFAULTS.billNote} onChange={e => setCo("billNote", e.target.value)} />
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Always hosted by Hans <span style={{ color: "var(--text3)", fontWeight: 500 }}>· a quote for these products does not ask "Hans or client hosting"</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8, border: "1.5px solid var(--border)", borderRadius: 8, background: "#fff" }}>
              {(catalog || []).filter(p => p && p.id).map(p => { const on = hansHostedProducts(cur.quoteConfig).includes(p.id); return (
                <button key={p.id} type="button" onClick={() => { const ids = hansHostedProducts(cur.quoteConfig); setConfig("hansHostedProductIds", on ? ids.filter(x => x !== p.id) : [...ids, p.id]); }}
                  style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 14, cursor: "pointer", border: `1.5px solid ${on ? "#1B6B5A" : "var(--border)"}`, background: on ? "#E6F4EF" : "#fff", color: on ? "#1B6B5A" : "var(--text2)", fontWeight: on ? 700 : 500 }}>
                  {on ? "✓ " : ""}{p.name}
                </button>); })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>Usage-billed services never ask for hosting. Tick the products that are also always run by Hans, such as the AMS filing services.</div>
          </div>
          <PeoplePicker label="Pricing owners (who may change prices and quotation rules)" orgUsers={orgUsers} value={cur.quoteConfig.pricingOwnerIds || []}
            onChange={(ids) => setConfig("pricingOwnerIds", ids)}
            hint="Leave empty and everyone who can edit Masters can change prices (as before). Once you name owners, only they, Admin and MD can; for everyone else prices are read-only, and the database refuses their price changes. Every change is kept in Price history." />
          <PeoplePicker label="Quote approvers" orgUsers={orgUsers} value={cur.quoteConfig.approverIds || []}
            onChange={(ids) => setConfig("approverIds", ids)}
            hint="Who approves a quote whose discount or value is above the limit. They get a bell alert and a task. Nobody approves their own quote unless they are the only approver. Leave empty and every Admin / MD / Director / VP approves (the old rule)." />
          <div style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Approval levels</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>
              A rep can give up to <b>{cur.quoteConfig.maxUserDiscountPct}%</b> alone (the Max discount % above). Beyond that, the quote goes to the first level whose ceiling covers its largest discount (line and overall discount combined).
              Low-margin quotes and products that allow no discount go to the last level. A higher level can always approve for a lower one.
            </div>
            {approvalLevels(cur.quoteConfig).map((lv, i, arr) => {
              const setLevels = (next) => setConfig("approvalLevels", next);
              const patch = (k, v) => setLevels(arr.map((x, j) => j === i ? { ...x, [k]: v } : x));
              return (
                <div key={lv.key} style={{ borderTop: i ? "1px dashed var(--border)" : "none", paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ marginBottom: 6 }}><label>Level {i + 1} name</label><input value={lv.label} onChange={e => patch("label", e.target.value)} style={{ width: 180 }} /></div>
                    <div className="form-group" style={{ marginBottom: 6 }}><label>Approves discounts up to %</label><input type="number" min={0} max={100} value={lv.maxDiscountPct} onChange={e => patch("maxDiscountPct", Number(e.target.value) || 0)} style={{ width: 110 }} /></div>
                    {arr.length > 1 && <button type="button" className="btn btn-xs btn-sec" style={{ marginBottom: 8 }} onClick={() => setLevels(arr.filter((_, j) => j !== i))}><Trash2 size={11} /> Remove</button>}
                  </div>
                  <PeoplePicker label={`${lv.label}: who approves`} orgUsers={orgUsers} value={lv.userIds || []} onChange={(ids) => patch("userIds", ids)}
                    hint={i === arr.length - 1 ? "Leave empty and Admin, MD and Director approve at this level." : "Leave empty and the quote approvers above approve at this level."} />
                </div>);
            })}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className="btn btn-xs btn-sec" onClick={() => { const arr = approvalLevels(cur.quoteConfig); setConfig("approvalLevels", [...arr, { key: `level_${Date.now().toString(36)}`, label: "New level", maxDiscountPct: 100, userIds: [] }]); }}><Plus size={11} /> Add level</button>
              <button type="button" className="btn btn-xs btn-sec" onClick={() => setConfig("approvalLevels", DEFAULT_APPROVAL_LEVELS)}><RotateCcw size={11} /> Standard levels (Line Manager 20%, Management Committee above)</button>
            </div>
          </div>
          <PeoplePicker label="Accounts team (raises bills)" orgUsers={orgUsers} value={cur.quoteConfig.accountsUserIds || []}
            onChange={(ids) => setConfig("accountsUserIds", ids)}
            hint="Told when Sales marks a quote FINAL, and can raise the bill from it. Leave empty and everyone with the Finance role is Accounts." />
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text3)" }}>
            Quote number format: <code>{cur.quoteConfig.quoteNumberPrefix}</code> + {cur.quoteConfig.quoteNumberSeqWidth}-digit sequence + <code>/YY-YY</code> (fiscal year, Apr–Mar).
          </div>
        </div>
      )}

      {/* ── Catalogue rates ── */}
      {sub === "catalogue" && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--text3)" }}>Prices for each product. Band / iCAFFE items price from Quotation Rules.</span>
              <button type="button" className="btn btn-xs btn-sec" onClick={() => setShowHistory(true)} title="Every change to prices and rules: who, when, before and after"><Clock size={12} /> Price history</button>
              <select value={prodFilter} onChange={e => setProdFilter(e.target.value)} style={{ ...numInput, width: "auto", textAlign: "left", cursor: "pointer" }}>
                <option value="">All products</option>
                {catalog.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value={SERVICES_GROUP}>{SERVICES_LABEL}</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              {importMsg && <span style={{ fontSize: 11, color: "#15803D" }}>Updated {importMsg.matched} of {importMsg.rows} row(s)</span>}
              <button className="btn btn-sec btn-xs" onClick={exportCatalogue}><Download size={12} /> Export CSV</button>
              <button className="btn btn-sec btn-xs" onClick={() => fileRef.current?.click()}><Upload size={12} /> Import CSV</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; importCatalogue(f); }} />
            </div>
          </div>
          {(() => {
            const toAdd = productsToAdd(cur.catalogue, catalog);
            return toAdd.length > 0 && onAddProducts ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", margin: "6px 0 10px", fontSize: 12.5, color: "#92400E" }}>
                <AlertTriangle size={14} />
                <span><b>{toAdd.length}</b> priced item{toAdd.length > 1 ? "s are" : " is"} not a product yet, so {toAdd.length > 1 ? "they" : "it"} can't be used on leads or deals: {toAdd.map(x => x.product.name).join(", ")}.</span>
                <button type="button" className="btn btn-primary btn-xs" onClick={() => onAddProducts(toAdd)}><Plus size={12} /> Add as products</button>
              </div>
            ) : null;
          })()}
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1080 }}>
            <thead>
              <tr style={{ background: "var(--s2)", textAlign: "left" }}>
                {["Product", "Code", "Name", "Model", "Billed as", "Unit", "Rate source", "List price (₹)", "Cost (₹)", "Floor/mo (₹)", "Min qty", "Max disc %", "AMC %", "Status", "Active"].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {groupRates(cur.catalogue, catalog).filter(g => g.rows.length && (!prodFilter || g.id === prodFilter)).map(g => [
                <tr key={`g-${g.id || "none"}`}>
                  <td colSpan={15} style={{ ...cell, background: g.id ? "#F1F5F9" : "#FEF2F2", fontWeight: 800, fontSize: 12, color: g.id ? "var(--text)" : "#B91C1C" }}>
                    {g.name} <span style={{ fontWeight: 500, color: "var(--text3)" }}>· {g.rows.length} price row{g.rows.length > 1 ? "s" : ""}</span>
                    {g.id && g.id !== SERVICES_GROUP && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, background: "#EEF2FF", color: "#4338CA", padding: "2px 8px", borderRadius: 10 }}>{productCommercialModel(g.rows).label}</span>}
                  </td>
                </tr>,
                ...g.rows.map(p => {
                const editablePrice = p.rateSource === "Flat" && !p.matrixId;
                const ccRow = (p.code === "CC03" || p.code === "CC04") && !ccs.ok;
                const st = rowStatus(p);
                const priceMissing = editablePrice && p.listPrice == null && p.active !== false;
                return (
                  <tr key={p.code} style={{ background: ccRow ? "#FEF2F2" : "transparent" }}>
                    <td style={cell}>
                      <select title="Which product this price belongs to" style={{ ...numInput, textAlign: "left", cursor: "pointer", minWidth: 110 }} value={groupOf(p, catalog)} onChange={e => setCatRow(p.code, "productId", e.target.value)}>
                        <option value="">— not linked —</option>
                        {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value={SERVICES_GROUP}>Services &amp; add-ons</option>
                      </select>
                    </td>
                    <td style={{ ...cell, fontFamily: "monospace", fontWeight: 700 }}>{p.code}</td>
                    <td style={cell}><input style={{ ...numInput, textAlign: "left" }} value={p.name ?? ""} onChange={e => setCatRow(p.code, "name", e.target.value)} /></td>
                    <td style={cell}>
                      <select style={{ ...numInput, textAlign: "left", cursor: "pointer" }} value={p.pricingModel || ""} onChange={e => setCatRow(p.code, "pricingModel", e.target.value)}>
                        {PRICING_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      {isOneTimeModel(p.pricingModel)
                        ? <span style={{ fontSize: 11.5, color: "var(--text3)" }}>One-time</span>
                        : <select title="Fixed recurring: a committed charge each period. Variable: billed on actual consumption; the quote agrees a rate only." style={{ ...numInput, textAlign: "left", cursor: "pointer", minWidth: 96, color: billingClassOf(p) === "transaction" ? "#4338CA" : undefined, fontWeight: billingClassOf(p) === "transaction" ? 700 : 400 }}
                            value={billingClassOf(p)} onChange={e => setCatRow(p.code, "billingClass", e.target.value)}>
                            <option value="subscription">Fixed recurring</option>
                            <option value="transaction">Variable (actual use)</option>
                          </select>}
                    </td>
                    <td style={cell}>
                      <select style={{ ...numInput, textAlign: "left", cursor: "pointer" }} value={p.unit || ""} onChange={e => setCatRow(p.code, "unit", e.target.value)}>
                        {QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      <select style={{ ...numInput, textAlign: "left", cursor: "pointer" }} value={p.rateSource || "Flat"} onChange={e => setCatRow(p.code, "rateSource", e.target.value)}>
                        {RATE_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ ...cell, ...(priceMissing ? { background: "#FEF2F2", boxShadow: "inset 0 0 0 1px #FCA5A5" } : {}) }}>
                      {editablePrice
                        ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input style={numInput} type="number" placeholder={priceMissing ? "enter rate" : ""} value={p.listPrice ?? ""} onChange={e => setCatRow(p.code, "listPrice", numOrNull(e.target.value))} />
                            <button type="button" title="Scheduled rate changes (effective-dated)" onClick={() => setSchedFor({ kind: "flat", key: p.code })}
                              style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: (p.rateSchedule || []).length ? "#EFF6FF" : "transparent", color: (p.rateSchedule || []).length ? "#1E40AF" : "var(--text3)", borderRadius: 5, padding: "1px 5px", cursor: "pointer", fontSize: 10, flexShrink: 0 }}>
                              <Clock size={11} />{(p.rateSchedule || []).length || ""}
                            </button>
                            {(() => { const n = Object.values(p.segmentPrices || {}).filter(v => v != null).length; return (
                              <button type="button" title="Segment price overrides" onClick={() => setSegFor(p.code)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: n ? "#F0FDFA" : "transparent", color: n ? "#0D9488" : "var(--text3)", borderRadius: 5, padding: "1px 5px", cursor: "pointer", fontSize: 10, flexShrink: 0 }}>
                                <Tag size={11} />{n || ""}
                              </button>
                            ); })()}
                            {(() => { const n = Object.values(p.currencyPrices || {}).filter(v => v != null).length; return (
                              <button type="button" title="Currency price overrides (native, bypasses FX)" onClick={() => setCurFor(p.code)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: n ? "#FFF7ED" : "transparent", color: n ? "#B45309" : "var(--text3)", borderRadius: 5, padding: "1px 5px", cursor: "pointer", fontSize: 10, flexShrink: 0 }}>
                                <Globe size={11} />{n || ""}
                              </button>
                            ); })()}
                            {!isOneTimeModel(p.pricingModel) && (
                              <button type="button" title="Usage pricing: prepaid pack, monthly minimum, pooled volume, yearly escalation" onClick={() => setSlabFor(p.code)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: hasUsageRules(p) ? "#EEF2FF" : "transparent", color: hasUsageRules(p) ? "#4338CA" : "var(--text3)", borderRadius: 5, padding: "1px 5px", cursor: "pointer", fontSize: 10, flexShrink: 0, fontWeight: 700 }}>
                                ≡{hasUsageRules(p) ? " usage" : ""}
                              </button>
                            )}
                          </span>
                        : p.rateSource === "Slab" && !p.matrixId
                          ? (() => { const sl = normalizeSlabs(p.slabs); const bad = slabProblems(sl).length > 0; return (
                              <button type="button" onClick={() => setSlabFor(p.code)} title="Edit the volume slabs"
                                style={{ border: `1px solid ${bad ? "#FCA5A5" : "var(--border)"}`, background: bad ? "#FEF2F2" : "#EFF6FF", color: bad ? "#B91C1C" : "#1E40AF", borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
                                {sl.length ? `${sl.length} slabs · ₹${sl.map(s => s.rate ?? "?").join(" / ")}` : "Set slabs"}
                              </button>); })()
                          : <span style={{ color: "var(--text3)", fontSize: 11 }}>— {p.matrixId ? "rate card" : p.rateSource} —</span>}
                    </td>
                    <td style={cell}>
                      <input style={numInput} type="number" placeholder="—" title="Per-unit cost — drives the margin guardrail" value={p.costPrice ?? ""} onChange={e => setCatRow(p.code, "costPrice", numOrNull(e.target.value))} />
                    </td>
                    <td style={cell}>
                      <input style={numInput} type="number" value={p.minMonthFloor ?? ""} onChange={e => setCatRow(p.code, "minMonthFloor", numOrNull(e.target.value))} />
                    </td>
                    <td style={cell}>
                      <input style={numInput} type="number" min={0} placeholder="—" title="Minimum committed quantity — quotes are billed on at least this many units" value={p.minQty ?? ""} onChange={e => setCatRow(p.code, "minQty", numOrNull(e.target.value))} />
                    </td>
                    <td style={cell}>
                      <input style={numInput} type="number" min={0} max={100} placeholder="policy" title="Product discount cap. Blank = company policy; 0 = any discount needs approval" value={p.maxDiscountPct ?? ""} onChange={e => setCatRow(p.code, "maxDiscountPct", numOrNull(e.target.value))} />
                    </td>
                    <td style={cell}>
                      {p.pricingModel === "One-time Licence"
                        ? <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input style={{ ...numInput, width: 56 }} type="number" min={0} max={100} placeholder={`${cur.quoteConfig.amcDefaultPct ?? cur.quoteConfig.alrPctOfLicence ?? 20}%`} title="AMC % of this licence per year. Blank = the default in Quotation Rules" value={p.amcPct ?? ""} onChange={e => setCatRow(p.code, "amcPct", numOrNull(e.target.value))} />
                            <input style={{ ...numInput, width: 78 }} type="number" min={0} placeholder="or ₹/unit" title="Or a fixed AMC in ₹ per unit per year (e.g. ₹10,000 per branch). Used instead of the %." value={p.amcFixed ?? ""} onChange={e => setCatRow(p.code, "amcFixed", numOrNull(e.target.value))} />
                          </span>
                        : <span style={{ color: "var(--text3)", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={cell}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, color: st.c, background: st.bg, whiteSpace: "nowrap" }}>{st.label}</span>
                    </td>
                    <td style={{ ...cell, textAlign: "center" }}>
                      <input type="checkbox" checked={p.active !== false} onChange={e => setCatRow(p.code, "active", e.target.checked)} />
                    </td>
                  </tr>
                );
              })])}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pricing Bands ── */}
      {sub === "bands" && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Shared band thresholds + the global default rate per band. A quote's user count picks the band; per-product / per-country rates below override the global rate.</div>
          <table style={{ borderCollapse: "collapse", maxWidth: 560 }}>
            <thead>
              <tr style={{ background: "var(--s2)", textAlign: "left" }}>
                {["Band", "From users", "To users", "₹ / user / month (global)", "Schedule"].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {cur.bands.map(b => (
                <tr key={b.band}>
                  <td style={cell}>{b.band}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{b.fromUsers}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{b.toUsers}</td>
                  <td style={cell}><input style={numInput} type="number" value={b.ratePerUserMonth ?? ""} onChange={e => setBandRate(b.band, numOrNull(e.target.value))} /></td>
                  <td style={{ ...cell, textAlign: "center" }}>
                    <button type="button" title="Scheduled rate changes (effective-dated)" onClick={() => setSchedFor({ kind: "band", key: b.band })}
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: (b.rateSchedule || []).length ? "#EFF6FF" : "transparent", color: (b.rateSchedule || []).length ? "#1E40AF" : "var(--text3)", borderRadius: 5, padding: "1px 6px", cursor: "pointer", fontSize: 10 }}>
                      <Clock size={11} />{(b.rateSchedule || []).length || ""}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Per-product / per-country band rates */}
          {(() => {
            const bandProducts = cur.catalogue.filter(p => p.rateSource === "Band");
            const prod = bandProducts.find(p => p.code === bandProd);
            const countries = ["Default", ...Object.keys(prod?.bandRates || {}).filter(k => k !== "Default" && k !== "default")];
            return (
              <div style={{ marginTop: 20, maxWidth: 720 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text1)", marginBottom: 4 }}>Per-product band rates (by country)</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 10 }}>Different Band products can have different rates, and the same product can be priced per country. A quote uses the product's row for its country, else its <b>Default</b> row, else the global rate above.</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
                    <label style={{ fontSize: 9 }}>Band product</label>
                    <select value={bandProd} onChange={e => { setBandProd(e.target.value); setBandCountry("Default"); }}>
                      <option value="">— Select a Band product —</option>
                      {bandProducts.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                    </select>
                  </div>
                  {prod && (
                    <>
                      <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
                        <label style={{ fontSize: 9 }}>Country</label>
                        <select value={bandCountry} onChange={e => setBandCountry(e.target.value)}>
                          {countries.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 9 }}>Add country</label>
                        <span style={{ display: "flex", gap: 4 }}>
                          <input value={newCountry} onChange={e => setNewCountry(e.target.value)} placeholder="e.g. UAE" style={{ width: 120 }} />
                          <button className="btn btn-sec btn-xs" onClick={() => { const c = newCountry.trim(); if (c) { setBandCountry(c); setProductBandRate(prod.code, c, 0, prod.bandRates?.[c]?.[0] ?? null); setNewCountry(""); } }}><Plus size={12} /></button>
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {prod && (
                  <table style={{ borderCollapse: "collapse", maxWidth: 560 }}>
                    <thead>
                      <tr style={{ background: "var(--s2)", textAlign: "left" }}>
                        {["Band", `₹/user/mo · ${bandCountry}`].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {cur.bands.map((b, i) => (
                        <tr key={b.band}>
                          <td style={cell}>{b.band}</td>
                          <td style={cell}><input style={numInput} type="number" placeholder={`global ${b.ratePerUserMonth ?? "—"}`} value={prod.bandRates?.[bandCountry]?.[i] ?? ""} onChange={e => setProductBandRate(prod.code, bandCountry, i, numOrNull(e.target.value))} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── iCAFFE matrix ── */}
      {sub === "icaffe" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                <th style={{ ...cell, textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>Edition</th>
                {ICAFFE_BAND_LABELS.map(l => <th key={l} style={{ ...cell, fontSize: 10, color: "var(--text3)" }}>{l}</th>)}
                <th style={{ ...cell, fontSize: 10, color: "var(--text3)" }}>Sched</th>
              </tr>
            </thead>
            <tbody>
              {cur.editions.map(e => (
                <tr key={e.name}>
                  <td style={{ ...cell, fontWeight: 600 }}>{e.name}</td>
                  {e.rates.map((r, i) => (
                    <td key={i} style={cell}><input style={numInput} type="number" value={r ?? ""} onChange={ev => setEditionRate(e.name, i, numOrNull(ev.target.value))} /></td>
                  ))}
                  <td style={{ ...cell, textAlign: "center" }}>
                    <button type="button" title="Scheduled rate-row changes (effective-dated)" onClick={() => setSchedFor({ kind: "edition", key: e.name })}
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: (e.rateSchedule || []).length ? "#EFF6FF" : "transparent", color: (e.rateSchedule || []).length ? "#1E40AF" : "var(--text3)", borderRadius: 5, padding: "1px 6px", cursor: "pointer", fontSize: 10 }}>
                      <Clock size={11} />{(e.rateSchedule || []).length || ""}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Rate Cards (generic sub-product × custom-tier × country matrices) ── */}
      {sub === "ratecards" && (() => {
        const card = cur.rateCards.find(c => c.id === cardId);
        const bands = card ? cardBands(card) : [];
        const countries = ["Default", ...Object.keys(card?.rates || {}).filter(k => k !== "Default" && k !== "default")];
        // Catalogue products available to attach (not iCAFFE; not already on a row)
        const attached = new Set(cur.rateCards.flatMap(c => (c.rows || []).map(r => r.productCode)));
        const available = cur.catalogue.filter(p => p.rateSource !== "iCAFFE" && !p.matrixId && (!attached.has(p.code) || (card?.rows || []).some(r => r.productCode === p.code)));
        return (
          <div style={{ maxWidth: 1100 }}>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 10 }}>
              Build your own rate cards for any product family — each card has its <b>own columns/tiers</b> (not just iCAFFE's user bands) and its own sub-products. Steps: <b>1)</b> add a card, <b>2)</b> define its tier columns, <b>3)</b> add sub-products (type a new name or pick an existing product), <b>4)</b> fill the rates. A quote line for a sub-product prices from its row × tier × country automatically.
            </div>

            {/* Landing — clickable list of cards + a prominent creator. Hidden
                once a card is open (the editor below takes over). */}
            {!card && (
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 9 }}>New rate card</label>
                    <input value={newCardLabel} onChange={e => setNewCardLabel(e.target.value)} placeholder="e.g. WiseCargo" style={{ width: 200 }}
                      onKeyDown={e => { if (e.key === "Enter") { const l = newCardLabel.trim(); if (l) { addRateCard(l); setNewCardLabel(""); } } }} />
                  </div>
                  <button className="btn btn-primary btn-xs" style={{ marginBottom: 2 }} disabled={!newCardLabel.trim()}
                    onClick={() => { const l = newCardLabel.trim(); if (l) { addRateCard(l); setNewCardLabel(""); } }}><Plus size={13} /> Create rate card</button>
                </div>

                {cur.rateCards.length === 0 ? (
                  <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "28px 20px", textAlign: "center", color: "var(--text3)" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", marginBottom: 4 }}>No rate cards yet</div>
                    <div style={{ fontSize: 12 }}>Create one above to price a product family by your own tiers (e.g. WiseCargo, WiseHandling).</div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                    {cur.rateCards.map(c => {
                      const tiers = cardBands(c).length;
                      const subs = (c.rows || []).length;
                      const ctrys = Object.keys(c.rates || {}).filter(k => k.toLowerCase() !== "default").length + 1;
                      const filledRows = (c.rows || []).filter(r => {
                        const row = c.rates?.Default?.[r.name];
                        return Array.isArray(row) && row.some(v => v != null);
                      }).length;
                      const ok = subs > 0 && filledRows === subs;
                      return (
                        <button key={c.id} type="button" onClick={() => { setCardId(c.id); setCardCountry("Default"); }}
                          style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", background: "var(--surface)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text1)" }}>{c.label}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap",
                              color: subs === 0 ? "#64748B" : ok ? "#15803D" : "#B45309",
                              background: subs === 0 ? "#F1F5F9" : ok ? "#F0FDF4" : "#FFFBEB" }}>
                              {subs === 0 ? "Empty" : ok ? "Ready" : "Needs rates"}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text3)" }}>
                            {subs} sub-product{subs === 1 ? "" : "s"} · {tiers} tier{tiers === 1 ? "" : "s"} · {ctrys} countr{ctrys === 1 ? "y" : "ies"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 700 }}>Open & edit →</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {card && (
              <div>
                {/* Back to the card list */}
                <button type="button" onClick={() => setCardId("")}
                  style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 12 }}>
                  ← All rate cards
                </button>
                {/* Card settings — name, what it's priced by, country, delete */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12, padding: "10px 12px", background: "var(--s2)", borderRadius: 8 }}>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                    <label style={{ fontSize: 9 }}>Card name</label>
                    <input value={card.label} onChange={e => updateCard(card.id, { label: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
                    <label style={{ fontSize: 9 }}>Priced by (unit)</label>
                    <input value={card.unitLabel || ""} placeholder="e.g. Users / Branches" onChange={e => updateCard(card.id, { unitLabel: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
                    <label style={{ fontSize: 9 }}>Country</label>
                    <select value={cardCountry} onChange={e => setCardCountry(e.target.value)}>
                      {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 9 }}>Add country</label>
                    <span style={{ display: "flex", gap: 4 }}>
                      <input value={newCardCountry} onChange={e => setNewCardCountry(e.target.value)} placeholder="e.g. UAE" style={{ width: 110 }} />
                      <button className="btn btn-sec btn-xs" onClick={() => { const c = newCardCountry.trim(); if (c) { updateCard(card.id, { rates: { ...(card.rates || {}), [c]: card.rates?.[c] || {} } }); setCardCountry(c); setNewCardCountry(""); } }}><Plus size={12} /></button>
                    </span>
                  </div>
                  <button className="btn btn-sec btn-xs" style={{ color: "#DC2626", marginBottom: 2, marginLeft: "auto" }} onClick={() => { if (window.confirm(`Delete rate card "${card.label}"? Its sub-product rows will detach.`)) { (card.rows || []).forEach(r => removeRow(card.id, r.name)); setRateCards(cur.rateCards.filter(c => c.id !== card.id)); setCardId(""); } }}><Trash2 size={12} /> Delete card</button>
                </div>

                {/* Step 2 — define the tier columns */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text1)", marginBottom: 4 }}>Columns / tiers</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8 }}>
                    Each column is a price tier. A quote line's quantity (<b>{card.unitLabel || "qty"}</b>) picks the tier whose <b>“From ≥”</b> is the highest value not exceeding it. For a single flat price per sub-product, just keep one tier at From 0.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    {bands.map((b, i) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px", display: "flex", gap: 6, alignItems: "flex-end", background: "white" }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: 9 }}>Column label</label>
                          <input value={b.label} onChange={e => editCardColumn(card.id, i, { label: e.target.value })} style={{ width: 90 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: 9 }}>From ≥</label>
                          <input type="number" value={b.from ?? 0} onChange={e => editCardColumn(card.id, i, { from: e.target.value === "" ? 0 : Number(e.target.value) })} style={{ width: 64 }} />
                        </div>
                        <button className="icon-btn" title="Remove column" style={{ color: "#DC2626", marginBottom: 2 }} disabled={bands.length <= 1} onClick={() => removeCardColumn(card.id, i)}><X size={14} /></button>
                      </div>
                    ))}
                    <button className="btn btn-sec btn-xs" style={{ marginBottom: 8 }} onClick={() => addCardColumn(card.id)}><Plus size={12} /> Add tier</button>
                  </div>
                </div>

                {/* Step 3/4 — sub-product × tier matrix */}
                {(card.rows || []).length === 0 && <div style={{ fontSize: 12, color: "var(--text3)", padding: "8px 0" }}>No sub-products yet — add one below.</div>}
                {(card.rows || []).length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", minWidth: 700 }}>
                      <thead>
                        <tr style={{ background: "var(--s2)" }}>
                          <th style={{ ...cell, textAlign: "left", fontSize: 10, color: "var(--text3)" }}>Sub-product · {cardCountry}</th>
                          {bands.map((b, i) => <th key={i} style={{ ...cell, fontSize: 10, color: "var(--text3)", textAlign: "center" }}>{b.label}</th>)}
                          <th style={{ ...cell }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(card.rows || []).map(r => (
                          <tr key={r.name}>
                            <td style={{ ...cell, fontWeight: 600 }}>{r.name}<div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "monospace" }}>{r.productCode}</div></td>
                            {bands.map((b, i) => (
                              <td key={i} style={cell}><input style={numInput} type="number" value={card.rates?.[cardCountry]?.[r.name]?.[i] ?? ""} onChange={e => setMatrixCell(card.id, cardCountry, r.name, i, numOrNull(e.target.value))} /></td>
                            ))}
                            <td style={{ ...cell, textAlign: "center" }}><button className="icon-btn" title="Remove sub-product" style={{ color: "#DC2626" }} onClick={() => removeRow(card.id, r.name)}><Trash2 size={13} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add a sub-product — type a new one, or attach an existing product */}
                <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginTop: 14, flexWrap: "wrap", padding: "10px 12px", border: "1px dashed var(--border)", borderRadius: 8 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 9 }}>New sub-product</label>
                    <span style={{ display: "flex", gap: 4 }}>
                      <input value={newInlineRow} onChange={e => setNewInlineRow(e.target.value)} placeholder="e.g. Standard Edition" style={{ width: 180 }}
                        onKeyDown={e => { if (e.key === "Enter" && newInlineRow.trim()) { addInlineRow(card.id, newInlineRow); setNewInlineRow(""); } }} />
                      <button className="btn btn-sec btn-xs" disabled={!newInlineRow.trim()} onClick={() => { addInlineRow(card.id, newInlineRow); setNewInlineRow(""); }}><Plus size={12} /> Add</button>
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text3)", paddingBottom: 6 }}>or</div>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
                    <label style={{ fontSize: 9 }}>Attach existing product</label>
                    <span style={{ display: "flex", gap: 4 }}>
                      <select value={newRowProduct} onChange={e => { setNewRowProduct(e.target.value); const p = cur.catalogue.find(x => x.code === e.target.value); setNewRowName(p ? p.name : ""); }}>
                        <option value="">— Select product —</option>
                        {available.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                      </select>
                      <button className="btn btn-sec btn-xs" disabled={!newRowProduct || !newRowName.trim()} onClick={() => { attachProductToRow(card.id, newRowName.trim(), newRowProduct); setNewRowProduct(""); setNewRowName(""); }}><Plus size={12} /> Add</button>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Terms ── */}
      {sub === "documents" && <QuoteDocumentsMaster masters={masters} setMasters={setMasters} />}

      {sub === "terms" && <QuoteTermsMaster masters={masters} setMasters={setMasters} catalog={catalog} />}
      {sub === "terms" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720, marginTop: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Commercial notes: the starting text of every new quote (all products)</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: -6 }}>Printed as "Commercial notes"; the rep can edit them on each quote.</div>
          {cur.terms.map(t => (
            <div className="form-group" key={t.key}>
              <label>{t.key}</label>
              <textarea rows={2} value={t.text} onChange={e => setTerm(t.key, e.target.value)} />
            </div>
          ))}
        </div>
      )}

      {/* ── Usage pricing editor: slabs (volume / graduated, monthly / yearly),
          prepaid pack, monthly minimum, pooled volume, yearly escalation ── */}
      {slabFor && (() => {
        const p = cur.catalogue.find(x => x.code === slabFor);
        if (!p) return null;
        const isSlab = p.rateSource === "Slab";
        const sl = Array.isArray(p.slabs) && p.slabs.length ? p.slabs : [{ from: 0, rate: p.listPrice ?? null }];
        const setSl = (arr) => setCatRow(p.code, "slabs", arr);
        const shown = normalizeSlabs(sl);
        const probs = isSlab ? slabProblems(sl) : [];
        const u = p.unit || "unit";
        const per = p.slabPeriod === "year" ? "year" : "month";
        const pools = [...new Set(cur.catalogue.map(r => String(r.pool || "").trim()).filter(Boolean))];
        const poolRows = p.pool ? cur.catalogue.filter(r => r.code !== p.code && String(r.pool || "").trim() === String(p.pool).trim()) : [];
        const prev = usagePrice({ ...p, slabs: sl }, usageQty);
        const monthly = Math.max(prev.amount, prev.floor);
        const field = (label, key, hint, extra = {}) => (
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11 }}>{label}</label>
            <input style={{ ...numInput, textAlign: "left" }} type="number" min={0} placeholder={hint} value={p[key] ?? ""} onChange={e => setCatRow(p.code, key, numOrNull(e.target.value))} {...extra} />
          </div>);
        const radio = (key, val, label, def) => (
          <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer", fontSize: 12.5 }}>
            <input type="radio" checked={(p[key] || def) === val} onChange={() => setCatRow(p.code, key, val)} />{label}
          </label>);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSlabFor(null)}>
            <div style={{ width: 640, maxWidth: "96vw", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Usage pricing · {p.code} {p.name}</div>
                <button className="icon-btn" onClick={() => setSlabFor(null)}><X size={16} /></button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10, flexWrap: "wrap", fontSize: 12.5 }}>
                  <b>Rate</b>
                  <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="radio" checked={!isSlab} onChange={() => setCatRow(p.code, "rateSource", "Flat")} />One rate (list price ₹{p.listPrice ?? "—"} per {u})</label>
                  <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="radio" checked={isSlab} onChange={() => { if (!Array.isArray(p.slabs) || !p.slabs.length) setSl(sl); setCatRow(p.code, "rateSource", "Slab"); }} />Slabs by volume</label>
                </div>

                {isSlab && (<div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 10 }}>{radio("slabMode", "volume", "Volume: whole volume at its slab's rate", "volume")}{radio("slabMode", "graduated", "Graduated: each band at its own rate", "volume")}</div>
                    <div style={{ display: "flex", gap: 10 }}>{radio("slabPeriod", "month", "Slab on monthly volume", "month")}{radio("slabPeriod", "year", "on yearly volume", "month")}</div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{[`From (per ${per})`, `Rate per ${u} (₹)`, "Covers", ""].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)", textAlign: "left" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {sl.map((x, i) => (
                        <tr key={i}>
                          <td style={cell}><input style={numInput} type="number" min={0} disabled={i === 0} value={i === 0 ? 0 : (x.from ?? "")} onChange={e => setSl(sl.map((y, j) => j === i ? { ...y, from: numOrNull(e.target.value) } : y))} /></td>
                          <td style={cell}><input style={numInput} type="number" min={0} placeholder="rate" value={x.rate ?? ""} onChange={e => setSl(sl.map((y, j) => j === i ? { ...y, rate: numOrNull(e.target.value) } : y))} /></td>
                          <td style={{ ...cell, fontSize: 12, color: "var(--text2)" }}>{(() => { const k = shown.findIndex(r => r.from === (i === 0 ? 0 : Math.floor(Number(x.from) || 0))); return k >= 0 ? slabLabel(shown, k, u) : "—"; })()}</td>
                          <td style={cell}>{i > 0 && <button className="icon-btn" title="Remove slab" onClick={() => setSl(sl.filter((_, j) => j !== i))}><Trash2 size={13} /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="btn btn-sec btn-xs" style={{ marginTop: 8 }} onClick={() => setSl([...sl, { from: (shown[shown.length - 1]?.from || 0) + 100, rate: null }])}><Plus size={12} /> Add slab</button>
                  {probs.length > 0 && <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 6 }}>{probs.join(" ")}</div>}
                </div>)}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {field(`Prepaid pack: ${u} a month`, "packQty", "none")}
                  {field("Pack price ₹ a month", "packPrice", "—", { disabled: !(Number(p.packQty) > 0) })}
                  {field("Minimum billing ₹ a month", "monthlyMinimum", "none")}
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11 }}>Pool: count volume together with</label>
                    <input style={{ ...numInput, textAlign: "left" }} list="usage-pools" placeholder="none (e.g. AMS manifests)" value={p.pool ?? ""} onChange={e => setCatRow(p.code, "pool", e.target.value || null)} />
                    <datalist id="usage-pools">{pools.map(x => <option key={x} value={x} />)}</datalist>
                  </div>
                  {field("Yearly escalation %", "escalationPct", "none")}
                </div>
                {poolRows.length > 0 && <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: -2 }}>Same pool: {poolRows.map(r => `${r.code} ${r.name}`).join(", ")}. On a quote their monthly volumes add up to pick the slab.</div>}

                <div style={{ marginTop: 12, background: "var(--s2)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>Try it:</b> at
                    <input style={{ ...numInput, width: 90 }} type="number" min={0} value={usageQty} onChange={e => setUsageQty(Number(e.target.value) || 0)} />
                    {u} a month{p.pool ? " (this row alone)" : ""} →
                    <b style={{ color: "#1E40AF" }}>{prev.missing ? "rate missing" : `₹${Math.round(monthly).toLocaleString("en-IN")} a month`}</b>
                    {!prev.missing && usageQty > 0 && <span style={{ color: "var(--text3)" }}>(average ₹{(monthly / usageQty).toFixed(2)} per {u}{prev.floor > prev.amount ? ", minimum applied" : ""})</span>}
                  </div>
                  {Number(p.escalationPct) > 0 && !prev.missing && <div style={{ marginTop: 4, color: "var(--text3)" }}>Monthly at this volume: {escalatedRates(monthly, p.escalationPct, 3).map((v, y) => `year ${y + 1} ₹${Math.round(v).toLocaleString("en-IN")}`).join(" · ")}</div>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Rate schedule editor (effective-dated rates · Phase 2a) ── */}
      {schedFor && (() => {
        const { kind, key } = schedFor;
        const obj = kind === "flat" ? cur.catalogue.find(x => x.code === key)
          : kind === "band" ? cur.bands.find(b => b.band === key)
          : cur.editions.find(e => e.name === key);
        if (!obj) return null;
        const sched = Array.isArray(obj.rateSchedule) ? obj.rateSchedule : [];
        const setSched = (arr) => kind === "flat" ? setCatRow(key, "rateSchedule", arr)
          : kind === "band" ? setBandSchedule(key, arr) : setEditionSchedule(key, arr);
        const update = (i, patch) => setSched(sched.map((s, idx) => idx === i ? { ...s, ...patch } : s));
        const title = kind === "flat" ? `${obj.code} ${obj.name}` : kind === "band" ? `Band ${obj.band}` : obj.name;
        const blankEntry = kind === "edition"
          ? { effectiveFrom: "", rates: obj.rates.map(() => null) }
          : kind === "band" ? { effectiveFrom: "", ratePerUserMonth: null } : { effectiveFrom: "", listPrice: null };
        const baseLabel = kind === "flat" ? `Base list price ${obj.listPrice ?? "—"}`
          : kind === "band" ? `Base rate ${obj.ratePerUserMonth ?? "—"}/user/mo` : "Base rate-row (per band)";
        const wide = kind === "edition";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSchedFor(null)}>
            <div style={{ width: wide ? 900 : 480, maxWidth: "96vw", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Clock size={15} /> Rate schedule · {title}</div>
                <button className="icon-btn" onClick={() => setSchedFor(null)}><X size={16} /></button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
                  <b style={{ color: "var(--text1)" }}>{baseLabel}</b> applies until a scheduled date. A quote uses the latest scheduled rate effective on/before its quote date.
                </div>
                {sched.length === 0 && <div style={{ fontSize: 12, color: "var(--text3)", padding: "8px 0" }}>No scheduled changes — the base rate always applies.</div>}
                {sched.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: wide ? "wrap" : "nowrap" }}>
                    <div className="form-group" style={{ marginBottom: 0, width: 150 }}>
                      <label style={{ fontSize: 9 }}>Effective from</label>
                      <input type="date" value={s.effectiveFrom || ""} onChange={e => update(i, { effectiveFrom: e.target.value })} />
                    </div>
                    {kind === "flat" && (
                      <div className="form-group" style={{ marginBottom: 0, width: 150 }}><label style={{ fontSize: 9 }}>List price (₹)</label>
                        <input type="number" value={s.listPrice ?? ""} onChange={e => update(i, { listPrice: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                    )}
                    {kind === "band" && (
                      <div className="form-group" style={{ marginBottom: 0, width: 150 }}><label style={{ fontSize: 9 }}>₹ / user / mo</label>
                        <input type="number" value={s.ratePerUserMonth ?? ""} onChange={e => update(i, { ratePerUserMonth: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                    )}
                    {kind === "edition" && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                        {(s.rates || []).map((rv, ri) => (
                          <div key={ri} style={{ width: 64 }}>
                            <div style={{ fontSize: 8, color: "var(--text3)" }}>{ICAFFE_BAND_LABELS[ri]}</div>
                            <input style={numInput} type="number" value={rv ?? ""} onChange={e => update(i, { rates: s.rates.map((x, xi) => xi === ri ? (e.target.value === "" ? null : Number(e.target.value)) : x) })} />
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="icon-btn" title="Remove" style={{ color: "#DC2626" }} onClick={() => setSched(sched.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button className="btn btn-sec btn-xs" style={{ marginTop: 4 }} onClick={() => setSched([...sched, blankEntry])}><Plus size={12} /> Add scheduled rate</button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: 12, borderTop: "1px solid var(--border)" }}>
                <button className="btn btn-primary btn-xs" onClick={() => setSchedFor(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Segment price overrides (segment price lists · Phase 2b) ── */}
      {segFor && (() => {
        const p = cur.catalogue.find(x => x.code === segFor);
        if (!p) return null;
        const segMap = p.segmentPrices || {};
        const setSeg = (seg, val) => setCatRow(p.code, "segmentPrices", { ...segMap, [seg]: val });
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSegFor(null)}>
            <div style={{ width: 420, maxWidth: "94vw", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Tag size={15} /> Segment prices · {p.code} {p.name}</div>
                <button className="icon-btn" onClick={() => setSegFor(null)}><X size={16} /></button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
                  A quote prices by its customer segment. Leave a segment blank to fall back to the base list price.
                </div>
                {QUOTE_SEGMENTS.map(seg => (
                  <div key={seg} className="form-group" style={{ marginBottom: 8 }}>
                    <label>{seg}{seg === "Commercial" ? " (base list price)" : ""}</label>
                    {seg === "Commercial"
                      ? <input type="number" value={p.listPrice ?? ""} onChange={e => setCatRow(p.code, "listPrice", e.target.value === "" ? null : Number(e.target.value))} />
                      : <input type="number" placeholder="— base —" value={segMap[seg] ?? ""} onChange={e => setSeg(seg, e.target.value === "" ? null : Number(e.target.value))} />}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: 12, borderTop: "1px solid var(--border)" }}>
                <button className="btn btn-primary btn-xs" onClick={() => setSegFor(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Currency price overrides (currency price lists · Phase 2c) ── */}
      {curFor && (() => {
        const p = cur.catalogue.find(x => x.code === curFor);
        if (!p) return null;
        const curMap = p.currencyPrices || {};
        const setCur = (code, val) => setCatRow(p.code, "currencyPrices", { ...curMap, [code]: val });
        const foreign = (cur.quoteConfig.currencies || []).filter(c => c.code !== "INR");
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setCurFor(null)}>
            <div style={{ width: 420, maxWidth: "94vw", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Globe size={15} /> Currency prices · {p.code} {p.name}</div>
                <button className="icon-btn" onClick={() => setCurFor(null)}><X size={16} /></button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
                  A native price for a currency is used as-is (no FX conversion). Leave blank to convert the INR base by FX. INR uses the base list price.
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>INR (base list price)</label>
                  <input type="number" value={p.listPrice ?? ""} onChange={e => setCatRow(p.code, "listPrice", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                {foreign.map(c => (
                  <div key={c.code} className="form-group" style={{ marginBottom: 8 }}>
                    <label>{c.code} <span style={{ fontWeight: 400, color: "var(--text3)" }}>(else ≈ ₹{p.listPrice ?? "—"} ÷ {c.fxToInr})</span></label>
                    <input type="number" placeholder="— convert by FX —" value={curMap[c.code] ?? ""} onChange={e => setCur(c.code, e.target.value === "" ? null : Number(e.target.value))} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: 12, borderTop: "1px solid var(--border)" }}>
                <button className="btn btn-primary btn-xs" onClick={() => setCurFor(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

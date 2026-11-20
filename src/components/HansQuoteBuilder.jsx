// ═══════════════════════════════════════════════════════════════════
// HansQuoteBuilder — CRM-driven, engine-backed quotation builder
// ═══════════════════════════════════════════════════════════════════
// Phase C of the Quotation Module brief. Opportunity-first flow: pick an
// opportunity → party auto-resolves (account or lead) → add catalogue
// lines (qty / months / disc%) → the pure pricingEngine computes the
// one-time / recurring split, prepayment, GST, ALR, grand total and TCV
// live. Guardrails surface inline. Saving pushes a quote into the shared
// `quotes` array (additive — engine breakdown under q.hans) so it shows
// in the existing Quote Register and reuses the existing export/approval.
//
// This EXTENDS the existing Quotations module (it is launched from its
// toolbar) without touching the legacy per-line-GST builder.
// ═══════════════════════════════════════════════════════════════════

import { slabLabel, slabIndex, poolVolumes, usagePrice } from "../lib/quotation/slabs";
import { billingClassOf, billingClassLabel, rowConfigIssues, requiredApprovalLevel, needsHostingChoice, discountForRate, rateAfterDiscount } from "../lib/quotation/commercial";
import { groupOf } from "../lib/quotation/productGroups";
import { slabTable } from "../lib/quotation/slabs";
import { activeAgreementLines, agreedUnitPrice, pricingSnapshot } from "../lib/quotation/agreements";
import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Trash2, X, AlertTriangle, Check, Info } from "lucide-react";
import {
  QUOTE_CONFIG, HANS_CATALOGUE, PRICING_BANDS, ICAFFE_EDITIONS,
  ICAFFE_BAND_FROM, ICAFFE_PLANS, QUOTE_TERMS, BILLING_FREQUENCIES, QUOTE_SEGMENTS,
} from "../data/quotationMasters";
import {
  resolveUnitPrice, computeLine, computeQuote, isOneTimeModel,
  evaluateDiscountGuardrail, evaluateMarginGuardrail, validateCcsRule, validateWiseHandlingModules,
  formatQuoteNumber, cardBandIndex,
} from "../lib/quotation/pricingEngine";
import { computeAmc, amcRules, describeEscalation, amcTermText } from "../lib/quotation/amc";
import { TC_TEMPLATES, STANDARD_TERMS } from "../data/constants";
import { printHansQuote } from "../lib/quotation/printQuote";
import { toLocalISODate } from "../utils/helpers";
import { allocateDocNo } from "../lib/db";
import { newQuoteId, nextQuoteNo, officeOf } from "../lib/quotation/docNumbers";
import { HOSTING_OPTIONS, HOSTING_LABEL } from "../lib/quotation/handover";
import { quoteProductOptions, rowSections, productsFromOpp, productsFromLines, productIdOfRow, lineForRow, chipLabel, rowPriceHint } from "../lib/quotation/quoteProducts";

const today = () => toLocalISODate();
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const inr2 = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Discount / prepayment boxes declare min 0, max 100; typed values are held to that range.
const pct0to100 = (v) => Math.min(100, Math.max(0, Number(v) || 0));

const BLANK_LINE = { productCode: "", qty: 1, months: 12, discountPct: 0 };

// Default payment milestones for one-time charges (% of the one-time total).
const ORDER_MILESTONE = [{ name: "With the order", pct: 100 }];
const DEFAULT_MILESTONES = [
  { name: "With the purchase order", pct: 50 },
  { name: "On go-live and user acceptance sign-off", pct: 50 },
];

export default function HansQuoteBuilder({
  opps = [], leads = [], accounts = [], contacts = [],
  quotes = [], setQuotes, currentUser, orgUsers = [], onClose,
  masters = null, editQuote = null, draft = null, catalog = [],
}) {
  // Masters resolve from persisted overrides if present, else seeded defaults.
  const config = masters?.quoteConfig || QUOTE_CONFIG;
  const catalogue = (masters?.catalogue && masters.catalogue.length ? masters.catalogue : HANS_CATALOGUE).filter(p => p.active !== false);
  const bands = masters?.bands || PRICING_BANDS;
  const editions = masters?.editions || ICAFFE_EDITIONS;
  const bandFrom = masters?.bandFrom || ICAFFE_BAND_FROM;
  const rateCards = masters?.rateCards || [];
  const catByCode = useMemo(() => Object.fromEntries(catalogue.map(p => [p.code, p])), [catalogue]);
  // Group products for the line picker: rate-card sub-products under their card,
  // everything else under "Catalogue", so reps can find rate-card items fast.
  const productGroups = useMemo(() => {
    const byCard = new Map();
    const general = [];
    for (const p of catalogue) {
      if (p.matrixId) {
        const card = rateCards.find(c => c.id === p.matrixId);
        const label = card ? card.label : "Rate card";
        if (!byCard.has(label)) byCard.set(label, []);
        byCard.get(label).push(p);
      } else general.push(p);
    }
    return { general, cards: [...byCard.entries()] };
  }, [catalogue, rateCards]);

  const me = orgUsers.find(u => u.id === currentUser);

  // ── Header / party state ────────────────────────────────────────────
  // When editing an existing engine quote, seed from its saved `hans`
  // breakdown + `items` so the legacy editor never has to touch it.
  const eh = editQuote && editQuote.hans ? editQuote.hans : null;
  const [oppId, setOppId] = useState(editQuote?.oppId || "");
  const [party, setParty] = useState(eh?.party || { name: "", address: "", state: "", gstin: "", country: "" });
  const [currency, setCurrency] = useState(eh?.currency || "INR");
  const [billingFrequency, setBillingFrequency] = useState(eh?.billingFrequency || editQuote?.billingFrequency || "Monthly");
  const [selectedPlan, setSelectedPlan] = useState(eh?.plan || "");
  const [segment, setSegment] = useState(eh?.segment || editQuote?.segment || "Commercial");
  // Hans- or client-hosted — asked on every quote (Quote → Accounts flow).
  const [hosting, setHosting] = useState(editQuote?.hosting || "");
  const [overallDiscountPct, setOverallDiscountPct] = useState(eh?.overallDiscountPct || 0);
  const [prepaymentApplicable, setPrepaymentApplicable] = useState(!!eh?.prepaymentApplicable);
  const [prepaymentDiscountPct, setPrepaymentDiscountPct] = useState(eh?.prepaymentDiscountPct ?? config.prepaymentDiscountPctDefault);
  const [notes, setNotes] = useState(editQuote?.notes || "");
  // AMC terms changed on this quote (empty = the company rules). Any change needs approval.
  const [amcOverrides, setAmcOverrides] = useState(eh?.amc?.overrides || {});
  const [showAmcEdit, setShowAmcEdit] = useState(false);
  // Print the discount for the customer to see (list rate, discount, net) or only net rates.
  const [showDiscount, setShowDiscount] = useState(!!eh?.showDiscount);
  // Terms & conditions (free text). Seed from the edited quote, else the
  // default Hans terms as a sensible starting block the rep can replace via
  // a template. Same field (quote.terms) the Custom Quote / print use.
  const defaultTermsText = ((masters?.terms && masters.terms.length) ? masters.terms : QUOTE_TERMS).map((t, i) => `${i + 1}. ${t.text}`).join("\n");
  const [termsText, setTermsText] = useState(
    editQuote?.terms
      ? (Array.isArray(editQuote.terms) ? editQuote.terms.join("\n") : editQuote.terms)
      : (eh?.termsText || defaultTermsText)
  );
  // Billing & tax snapshot — same fields the Custom Quote captures, so the
  // saved quote is complete in the Verify checklist / register / print.
  // Auto-filled from the account on opp-pick; editable.
  const blankBilling = {
    legalName: "", pan: "", taxTreatment: "", shippingAddress: "",
    paymentTerms: "", creditDays: "", poMandatory: "", poNumber: "",
    // Billing / Finance contacts — name+email persist to columns; phone and
    // finance name/phone ride along in hans.billing (JSONB, no migration).
    billingContactName: "", billingContactEmail: "", billingContactPhone: "",
    financeContactName: "", financeContactEmail: "", financeContactPhone: "",
  };
  const [billing, setBilling] = useState(eh?.billing || (editQuote ? {
    ...blankBilling,
    legalName: editQuote.legalName || "", pan: editQuote.pan || "", taxTreatment: editQuote.taxTreatment || "",
    shippingAddress: editQuote.shippingAddressSnapshot || "", paymentTerms: editQuote.paymentTerms || "",
    creditDays: editQuote.creditDays ?? "", poMandatory: editQuote.poMandatory || "", poNumber: editQuote.poNumber || "",
    billingContactName: editQuote.billingContactName || "", billingContactEmail: editQuote.billingContactEmail || "",
    financeContactEmail: editQuote.financeContactEmail || "",
  } : { ...blankBilling }));
  const [showBilling, setShowBilling] = useState(false);
  const setBill = (k, v) => setBilling(b => ({ ...b, [k]: v }));
  const [lines, setLines] = useState(
    editQuote && Array.isArray(editQuote.items) && editQuote.items.length
      ? editQuote.items.map(it => ({ productCode: it.productCode || "", qty: it.billingClass === "transaction" ? (Number(it.qty) || 0) : (Number(it.qty) || 1), months: Number(it.months) || (it.billingClass === "transaction" ? 12 : 1), discountPct: Number(it.discountPct) || 0,
          // The rate agreed on this quote (kept when the quote is frozen).
          frozenRate: Number.isFinite(Number(it.unitPriceResolved)) ? Number(it.unitPriceResolved) : undefined }))
      : [{ ...BLANK_LINE }]
  );
  // Product-led building: the products being quoted. The screen shows only
  // their items (fixed recurring / variable / one-time) and the controls they need.
  const productOptions = useMemo(() => quoteProductOptions(catalogue, catalog), [catalogue, catalog]);
  const [productIds, setProductIds] = useState(() => productsFromLines(editQuote?.items || [], (c) => catByCode[c], catalog));
  // A quote that was approved, sent or accepted is a commercial record: its
  // rates do not follow the price list. Re-pricing is an explicit, logged act.
  const startsFrozen = !!editQuote && (editQuote.approvalStatus === "Approved" || ["Sent", "Under Review", "Accepted"].includes(editQuote.status) || !!editQuote.isFinal);
  const [frozen, setFrozen] = useState(startsFrozen);
  // Rates this customer already agreed (their active agreements) are used
  // for a new quote unless the rep switches them off.
  const [useAgreed, setUseAgreed] = useState(true);
  // One-time charges: payment milestones (name + % of the one-time total).
  const [milestones, setMilestones] = useState(() => (Array.isArray(eh?.milestones) && eh.milestones.length ? eh.milestones : (config.defaultMilestones || DEFAULT_MILESTONES)).map(m => ({ ...m })));
  // Until the rep edits the schedule, it follows the kind of quote (see the effect below).
  const [milestonesTouched, setMilestonesTouched] = useState(Array.isArray(eh?.milestones) && eh.milestones.length > 0);
  const [saved, setSaved] = useState(null);

  // Resolve party from the picked opportunity. The app's opportunities
  // link to an account (existing customer) and/or a source lead (new).
  const onPickOpp = (id) => {
    setOppId(id);
    const opp = opps.find(o => o.id === id);
    if (opp) setProductIds(cur => (cur.length ? cur : productsFromOpp(opp, productOptions)));
    if (!opp) { setParty({ name: "", address: "", state: "", gstin: "", country: "" }); setBilling({ ...blankBilling }); return; }
    const acc = accounts.find(a => a.id === opp.accountId);
    const lead = leads.find(l => l.id === opp.sourceLeadId || (Array.isArray(opp.sourceLeadIds) && opp.sourceLeadIds.includes(l.id)));
    // Inherit the customer segment when it matches a known quote segment.
    if (acc && QUOTE_SEGMENTS.includes(acc.segment)) setSegment(acc.segment);
    if (acc) {
      setParty({
        name: acc.legalName || acc.name || "",
        address: acc.billingAddress || acc.address || "",
        state: acc.billingState || acc.state || "",
        gstin: acc.gstin || "",
        country: acc.country || opp.country || "",
      });
      // Pull the billing contact from the account's primary contact (name +
      // phone + email) when present, falling back to the account-level fields.
      const accContacts = (contacts || []).filter(c => c.accountId === acc.id);
      const primary = accContacts.find(c => c.primary) || accContacts[0] || null;
      setBilling({
        ...blankBilling,
        legalName: acc.legalName || acc.name || "",
        pan: acc.pan || "",
        taxTreatment: acc.taxTreatment || "",
        shippingAddress: acc.shippingAddress || "",
        paymentTerms: acc.paymentTerms || "",
        creditDays: acc.creditDays ?? "",
        poMandatory: acc.poMandatory || "",
        poNumber: "",
        billingContactName: acc.billingContactName || primary?.name || acc.primaryContact || "",
        billingContactEmail: acc.billingContactEmail || primary?.email || acc.primaryEmail || "",
        billingContactPhone: primary?.phone || acc.primaryPhone || "",
        financeContactName: "",
        financeContactEmail: acc.financeContactEmail || "",
        financeContactPhone: "",
      });
    } else if (lead) {
      setParty({ name: lead.company || "", address: lead.address || "", state: lead.state || "", gstin: lead.gstin || "", country: lead.country || opp.country || "" });
      setBilling({ ...blankBilling, legalName: lead.company || "", billingContactName: lead.contact || "", billingContactEmail: lead.email || "", billingContactPhone: lead.phone || "" });
    }
  };

  // A draft from the Quote Assistant chat: fill the builder once, then the rep
  // checks the engine's prices and saves (approval rules apply as usual).
  const seededDraft = useRef(false);
  useEffect(() => {
    if (!draft || editQuote || seededDraft.current) return;
    seededDraft.current = true;
    if (draft.oppId) onPickOpp(draft.oppId);
    if (draft.segment) setSegment(draft.segment);
    if (draft.currency) setCurrency(draft.currency);
    if (draft.hosting) setHosting(draft.hosting);
    if (draft.billingFrequency) setBillingFrequency(draft.billingFrequency);
    setOverallDiscountPct(Number(draft.overallDiscountPct) || 0);
    setPrepaymentApplicable(!!draft.prepaymentApplicable);
    if (draft.notes) setNotes(draft.notes);
    if (Array.isArray(draft.lines) && draft.lines.length) {
      setLines(draft.lines.map(l => ({ productCode: l.productCode, qty: Number(l.qty) || 1, months: Number(l.months) || 12, discountPct: Number(l.discountPct) || 0 })));
      const fromLines = productsFromLines(draft.lines, (c) => catByCode[c], catalog);
      setProductIds(cur => [...new Set([...cur, ...fromLines])]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Contacts belonging to the picked opportunity's account — drive the
  // "pick existing contact" dropdowns for billing / finance.
  const accountContacts = useMemo(() => {
    const opp = opps.find(o => o.id === oppId);
    if (!opp) return [];
    const all = contacts || [];
    const seen = new Set();
    const out = [];
    const add = (c) => { if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } };
    // 1) Contacts linked to the opp's account by id.
    if (opp.accountId) all.filter(c => c.accountId === opp.accountId).forEach(add);
    // 2) Fallback — match by account NAME (legacy data links contacts to the
    //    company name, not the internal account id).
    const acc = accounts.find(a => a.id === opp.accountId);
    if (acc?.name) {
      const norm = acc.name.trim().toLowerCase();
      all.filter(c => {
        const cAcc = accounts.find(a => a.id === c.accountId);
        return cAcc && (cAcc.name || "").trim().toLowerCase() === norm;
      }).forEach(add);
    }
    // 3) The opportunity's own primary / secondary contacts.
    [opp.primaryContactId, ...(opp.secondaryContactIds || [])].filter(Boolean)
      .forEach(id => add(all.find(c => c.id === id)));
    // 4) For a lead-sourced opp, the lead's linked contacts.
    const lead = leads.find(l => l.id === opp.sourceLeadId || (Array.isArray(opp.sourceLeadIds) && opp.sourceLeadIds.includes(l.id)));
    (lead?.contactIds || []).forEach(id => add(all.find(c => c.id === id)));
    return out;
  }, [oppId, opps, contacts, accounts, leads]);

  // Apply a chosen contact into the billing/finance fields. role = "billing" | "finance".
  const applyContact = (role, contactId) => {
    const c = (contacts || []).find(x => x.id === contactId);
    if (!c) return;
    if (role === "billing") setBilling(b => ({ ...b, billingContactName: c.name || "", billingContactEmail: c.email || "", billingContactPhone: c.phone || "" }));
    else setBilling(b => ({ ...b, financeContactName: c.name || "", financeContactEmail: c.email || "", financeContactPhone: c.phone || "" }));
  };

  // ── Line helpers ────────────────────────────────────────────────────
  // An item button adds the item (or removes it when it is already on the quote).
  const toggleRow = (row) => setLines(ls => ls.some(l => l.productCode === row.code)
    ? ls.filter(l => l.productCode !== row.code)
    : [...ls.filter(l => catByCode[l.productCode]), lineForRow(row)]);
  const toggleProduct = (id) => {
    if (!productIds.includes(id)) { setProductIds(ids => [...ids, id]); return; }
    const theirs = lines.filter(l => catByCode[l.productCode] && productIdOfRow(catByCode[l.productCode], catalog) === id);
    const name = productOptions.find(o => o.id === id)?.name || id;
    if (theirs.length && !window.confirm(`Remove ${name} and its ${theirs.length} item${theirs.length === 1 ? "" : "s"} from this quote?`)) return;
    setLines(ls => ls.filter(l => !theirs.includes(l)));
    setProductIds(ids => ids.filter(x => x !== id));
  };
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i));
  // Changing the product drops the frozen rate: a new product prices from the price list.
  const updateLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch, ...("productCode" in patch && patch.productCode !== l.productCode ? { frozenRate: undefined } : {}) } : l));

  // The quote date drives effective-dated (scheduled) rates — an edited
  // quote keeps its original date; a new one prices as of today.
  const quoteDate = editQuote?.createdDate || today();
  // FX divisor for the selected currency (INR base → /fxToInr). A product
  // with an explicit native price for the currency bypasses this entirely.
  const fxForCurrency = (config.currencies || []).find(c => c.code === currency)?.fxToInr || Number(config.fx) || 1;
  // Enrich each line with its catalogue snapshot + resolved unit price,
  // shaped exactly as the engine expects.
  const agreedLines = useMemo(() => {
    const accountId = opps.find(o => o.id === oppId)?.accountId || "";
    const all = activeAgreementLines((quotes || []).filter(q => q.id !== editQuote?.id), accountId, quoteDate);
    // Only agreements in the quote's currency apply.
    return Object.fromEntries(Object.entries(all).filter(([, v]) => (v.agreement.currency || "INR") === currency));
  }, [quotes, opps, oppId, quoteDate, currency, editQuote?.id]);
  const pricedLines = useMemo(() => { const pools = poolVolumes(lines, (c) => catByCode[c]); return lines.map(l => {
    const p = catByCode[l.productCode];
    if (!p) return { ...l, _empty: true, pricingModel: "", unitPriceResolved: 0, missingRate: false };
    // Usage pricing: rows sharing a pool count their volume together for the slab.
    const poolQty = String(p.pool || "").trim() ? pools[String(p.pool).trim()] : undefined;
    const live = resolveUnitPrice(p, { qty: l.qty, poolQty, bands, editions, bandFrom, rateCards, config, fx: fxForCurrency, asOf: quoteDate, segment, currency, country: party.country });
    const rateFrozen = frozen && l.frozenRate != null;
    const agreed = !rateFrozen && useAgreed ? agreedLines[p.code] : null;
    const unitPrice = rateFrozen ? l.frozenRate : agreed ? agreedUnitPrice(agreed.line, l.qty, { poolQty }) : live.unitPrice;
    const missingRate = rateFrozen || agreed ? false : live.missingRate;
    const billingClass = billingClassOf(p);
    const usage = usagePrice(p, l.qty, { poolQty });
    const agreedMin = useAgreed && !(frozen && l.frozenRate != null) ? agreedLines[p.code]?.line : null;
    const monthlyMinimum = agreedMin ? Math.max(Number(agreedMin.monthlyMinimum) || 0, Number(agreedMin.pricing?.packPrice) || 0) : usage.floor / fxForCurrency;
    const oneTime = isOneTimeModel(p.pricingModel);
    // A variable line is billed monthly on actual use: no term. Only a line with
    // a contractual minimum keeps one (the months the minimum is committed for).
    const variableOpen = billingClass === "transaction" && !(monthlyMinimum > 0) && !(Number(p.minMonthFloor) > 0);
    const lineMonths = oneTime ? 1 : variableOpen ? 0 : l.months;
    // Rate-card lines: surface the card + the tier the qty resolves to, so the
    // rep sees where the unit price came from.
    const card = p.matrixId ? rateCards.find(c => c.id === p.matrixId) : null;
    const cb = card && Array.isArray(card.bands) && card.bands.length ? card.bands : null;
    const tierLabel = card ? (cb ? cb[cardBandIndex(l.qty, cb.map(b => Number(b.from) || 0))]?.label : null)
      : p.rateSource === "Slab" ? `${p.slabMode === "graduated" ? "Graduated, top band" : "Slab"}: ${slabLabel(p.slabs, slabIndex(usage.slabVolume, p.slabs), `${p.unit || "units"}/${p.slabPeriod === "year" ? "year" : "month"}`)}${poolQty != null && poolQty !== Number(l.qty) ? ` (pool ${p.pool}: ${poolQty}/month)` : ""}`
      : Number(p.packQty) > 0 ? `Pack: ${p.packQty} ${p.unit || "units"} for ₹${Number(p.packPrice || 0).toLocaleString("en-IN")}/month` : null;
    return {
      ...l,
      productCode: p.code, name: p.name, module: p.module, description: p.description,
      pricingModel: p.pricingModel, unit: p.unit, minMonthFloor: p.minMonthFloor,
      minQty: p.minQty, maxDiscountPct: p.maxDiscountPct,
      unitPriceResolved: unitPrice, missingRate,
      rateCardLabel: card ? card.label : null, tierLabel,
      // Per-unit cost (same scale as the resolved unit price) for the margin
      // guardrail — only present when the product has a cost in masters.
      costPerUnit: p.costPrice != null ? (Number(p.costPrice) || 0) / fxForCurrency : null,
      months: lineMonths, variableOpen, productId: groupOf(p, catalog),
      slabRates: p.rateSource === "Slab" && !agreed ? slabTable(p.slabs, p.unit) : (agreed?.line?.pricing?.rateSource === "Slab" ? slabTable(agreed.line.pricing.slabs, p.unit) : null),
      monthlyMinimum, escalationPct: Number(p.escalationPct) || 0,
      rateFrozen, liveRate: live.unitPrice, configIssues: rowConfigIssues(p),
      agreedNo: agreed ? agreed.agreement.agreementNo : "", pricing: agreed ? (agreed.line.pricing || null) : pricingSnapshot(p),
      ...computeLine({ pricingModel: p.pricingModel, billingClass, unitPriceResolved: unitPrice, qty: l.qty, months: lineMonths, discountPct: l.discountPct, minMonthFloor: p.minMonthFloor, minQty: p.minQty, monthlyMinimum, escalationPct: p.escalationPct }),
    };
  }); }, [frozen, useAgreed, agreedLines, catalog, lines, catByCode, bands, editions, bandFrom, rateCards, config, quoteDate, segment, currency, fxForCurrency, party.country]);

  const summary = useMemo(() => computeQuote(
    pricedLines.filter(l => !l._empty),
    { customerState: party.state, overallDiscountPct, prepaymentApplicable, prepaymentDiscountPct },
    config
  ), [pricedLines, party.state, overallDiscountPct, prepaymentApplicable, prepaymentDiscountPct, config]);

  // ── Guardrails ──────────────────────────────────────────────────────
  const discGuard = evaluateDiscountGuardrail(pricedLines, { overallDiscountPct }, config);
  const marginGuard = evaluateMarginGuardrail(pricedLines, config);
  const usedCatalogueForCcs = catalogue; // CC03/CC04 validated against the active rate card
  const ccsRule = validateCcsRule(usedCatalogueForCcs);
  const usesBothCcs = pricedLines.some(l => l.productCode === "CC03") && pricedLines.some(l => l.productCode === "CC04");
  const whRule = validateWiseHandlingModules(pricedLines);
  const missingRateLines = pricedLines.filter(l => l.missingRate);
  const amc = useMemo(() => computeAmc(pricedLines, { config, catalogue, overallDiscountPct, overrides: amcOverrides }), [pricedLines, config, catalogue, overallDiscountPct, amcOverrides]);
  // A component with incomplete configuration can only be quoted with an approver's sign-off.
  const configReasons = pricedLines.filter(l => !l._empty && l.configIssues?.length).map(l => `${l.name || l.productCode}: ${l.configIssues.join(", ")} in the price list`);
  const needsApproval = discGuard.breached || marginGuard.breached || amc.breached || configReasons.length > 0;
  const approvalReasons = [...discGuard.reasons, ...marginGuard.reasons, ...amc.deviations, ...configReasons];
  // Which level signs off: by the largest effective discount; margin breaches and
  // "any discount needs management approval" products go to the top level.
  const approvalLevel = requiredApprovalLevel({
    needsApproval, lines: pricedLines.filter(l => !l._empty), overallDiscountPct,
    topLevel: marginGuard.breached || pricedLines.some(l => l.maxDiscountPct === 0 && Number(l.discountPct) > 0),
  }, config);
  const hasOneTime = summary.oneTimeSubtotal > 0;
  const picked = pricedLines.filter(l => !l._empty);
  // Hosting is asked only for software the customer could host themselves;
  // consumption services and always-Hans-hosted products (AMS) skip it.
  const hostingNeeded = picked.length === 0 || needsHostingChoice(picked, config);
  const hostingValue = hostingNeeded ? hosting : "Hans";
  const hasSubscription = picked.some(l => l.billingClass === "subscription");
  // Software with a subscription: 50% with the order, 50% on go-live. Services
  // billed on use (AMS registration and the like): payable with the order.
  useEffect(() => {
    if (milestonesTouched || picked.length === 0) return;
    setMilestones((hasSubscription ? (config.defaultMilestones || DEFAULT_MILESTONES) : ORDER_MILESTONE).map(m => ({ ...m })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSubscription, picked.length, milestonesTouched]);
  const milestoneSum = milestones.reduce((t, m) => t + (Number(m.pct) || 0), 0);
  const repriced = startsFrozen && !frozen;

  // ── Save ────────────────────────────────────────────────────────────
  const canSave = oppId && party.name && (!hostingNeeded || hosting) && picked.length > 0 && missingRateLines.length === 0 && (!hasOneTime || milestoneSum === 100);

  // Advisory billing-completeness hint (doesn't block save — the engine only
  // needs opp + party + a priced line). Mirrors the Custom Quote's verify intent.
  const billingMissing = [
    !party.address && "Billing address",
    !party.gstin && "GSTIN",
    !billing.billingContactEmail && "Billing contact email",
    !billing.paymentTerms && "Payment terms",
  ].filter(Boolean);

  // Ids are random and the quote number comes from the shared DB counter
  // (supabase/doc_numbers_v1.sql). Both used to be "highest number in MY list
  // + 1", which collided across users: reps only see their team's quotes and
  // nobody sees deleted ones, so new quotes failed to save or overwrote others.
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!canSave || !setQuotes || saving) return;
    setSaving(true);
    try { await _save(); } finally { setSaving(false); }
  };
  const _save = async () => {
    const opp = opps.find(o => o.id === oppId);
    const isEdit = !!editQuote;
    const quoteNo = isEdit && editQuote.quoteNo ? editQuote.quoteNo
      : (await nextQuoteNo(allocateDocNo, config, quotes, new Date(), { office: officeOf(me, config) })).quoteNo;
    const id = isEdit ? editQuote.id : newQuoteId();
    const items = pricedLines.filter(l => !l._empty).map((l, idx) => ({
      lineNo: idx + 1, productCode: l.productCode, name: l.name, module: l.module,
      description: l.description, pricingModel: l.pricingModel, unit: l.unit,
      unitPriceResolved: +l.unitPriceResolved.toFixed(2), qty: Number(l.qty) || 0,
      months: l.effectiveMonths, discountPct: Number(l.discountPct) || 0,
      minMonthFloor: l.minMonthFloor ?? null,
      billingClass: l.billingClass, monthlyMinimum: +(Number(l.isVariable ? l.committedPerPeriod : l.monthlyMinimum) || 0).toFixed(2),
      escalationPct: Number(l.escalationPct) || 0,
      // The slab / pack / minimum settings as quoted, so the agreement keeps them.
      ...(l.pricing ? { pricing: l.pricing } : {}), ...(l.agreedNo ? { agreedNo: l.agreedNo } : {}),
      // Variable lines: lineTotal is the committed minimum only; lineEstimate is internal.
      lineEstimate: +(Number(l.lineEstimate) || 0).toFixed(2),
      lineOneTime: +l.lineOneTime.toFixed(2), lineRecurring: +l.lineRecurring.toFixed(2),
      lineTotal: +l.lineTotal.toFixed(2),
    }));
    // The quote's AMC terms ride in the T&C (one line, replaced on every save).
    const termsWithAmc = amc.applies ? [termsText.replace(/\n?AMC: [^\n]*/g, "").trimEnd(), amcTermText(amc, config)].join("\n") : termsText;
    // Additive engine breakdown — absolute ₹, rounded to paise.
    const round2 = (v) => +(Number(v) || 0).toFixed(2);
    const hans = {
      pricingMode: "hans-engine",
      party, currency,
      overallDiscountPct, prepaymentApplicable, prepaymentDiscountPct, showDiscount,
      oneTimeSubtotal: round2(summary.oneTimeSubtotal),
      recurringSubtotal: round2(summary.recurringSubtotal),
      subtotal: round2(summary.subtotal),
      overallDiscount: round2(summary.overallDiscount),
      prepaymentDisc: round2(summary.prepaymentDisc),
      taxableBase: round2(summary.taxableBase),
      cgst: round2(summary.cgst), sgst: round2(summary.sgst), igst: round2(summary.igst),
      gstTotal: round2(summary.gstTotal),
      grandTotal: round2(summary.grandTotal),
      licenceBase: round2(summary.licenceBase),
      alrAnnual: round2(amc.annual), // kept for older readers: now the AMC per year
      amc: { ...amc, overrides: amcOverrides },
      approvalReasons, approvalLevel,
      hostingAsked: hostingNeeded, // false: hosting was not a choice for these services
      // Commercial classification and the committed / variable split.
      commercialModel: summary.commercialModel,
      variableEstimate: round2(summary.variableEstimate), variableEstimateMonthly: round2(summary.variableEstimateMonthly),
      milestones: hasOneTime ? milestones.filter(m => m.name && Number(m.pct) > 0) : [],
      ...(repriced ? { repricedAt: new Date().toISOString(), repricedBy: currentUser } : {}),
      tcv: round2(summary.tcv),
      intraState: summary.intraState,
      billingFrequency, // invoicing cadence (Monthly / Quarterly / …)
      segment, // customer segment driving segment price lists
      plan: selectedPlan, // chosen iCAFFE plan preset (for re-seed on edit)
      terms: QUOTE_TERMS,
      termsText: termsWithAmc, // the rep's edited T&C (rendered by print), with the AMC line
      billing, // snapshot for clean re-seed on edit
    };
    // Billing & tax snapshot mapped onto the quote with the same field names
    // the Custom Quote / Verify checklist / register use, so an engine quote
    // is complete everywhere (not just in the Hans builder).
    const billingSnapshot = {
      legalName: billing.legalName || party.name || "",
      gstin: party.gstin || "",
      pan: billing.pan || "",
      taxTreatment: billing.taxTreatment || "",
      billingAddressSnapshot: party.address || "",
      shippingAddressSnapshot: billing.shippingAddress || "",
      placeOfSupply: party.state || "",
      paymentTerms: billing.paymentTerms || "",
      creditDays: Number(billing.creditDays) || 0,
      poMandatory: billing.poMandatory || "",
      poNumber: billing.poNumber || "",
      billingContactName: billing.billingContactName || "",
      billingContactEmail: billing.billingContactEmail || "",
      financeContactEmail: billing.financeContactEmail || "",
      exchangeRate: config.currencies.find(c => c.code === currency)?.fxToInr || 1,
    };
    const quote = {
      id, quoteNo, title: opp?.title || opp?.name || party.name,
      oppId, accountId: opp?.accountId || "", sourceLeadId: opp?.sourceLeadId || "",
      // Keep `status` within the register's known enum (Draft) and drive the
      // approval queue via `approvalStatus` — the same mechanism legacy quotes
      // use, so the quote stays visible under status filters/KPIs. Preserve a
      // non-Draft status when re-saving an edit (e.g. already Sent).
      status: isEdit ? (editQuote.status || "Draft") : "Draft",
      approvalStatus: needsApproval ? "Pending" : "Not Required",
      // Register shows totals in ₹L (lakh) — keep its convention.
      subtotal: +(summary.subtotal / 1e5).toFixed(2),
      discount: +((summary.overallDiscount + summary.prepaymentDisc) / 1e5).toFixed(2),
      taxAmount: +(summary.gstTotal / 1e5).toFixed(2),
      total: +(summary.grandTotal / 1e5).toFixed(2),
      currency, notes, preparedBy: me?.name || currentUser,
      billingFrequency, // invoicing cadence — also lives in hans for print
      segment, // also in hans
      hosting: hostingValue,
      owner: isEdit ? (editQuote.owner || currentUser) : currentUser,
      createdDate: isEdit ? (editQuote.createdDate || today()) : today(),
      terms: termsWithAmc, // legacy/register/verify read quote.terms
      ...billingSnapshot,
      items, hans,
    };
    // Edit → replace by id (preserving other fields like changeLog/emailLog);
    // create → append.
    if (isEdit && repriced) quote.changeLog = [...(editQuote.changeLog || []), { id: `ce_${Date.now()}`, at: new Date().toISOString(), by: currentUser, field: "pricing", from: "rates agreed on the quote", to: "current price list", note: "Re-priced from the Pricing Master" }];
    if (isEdit) setQuotes(p => p.map(r => r.id === id ? { ...r, ...quote } : r));
    else setQuotes(p => [...p, quote]);
    setSaved(quote);
  };

  // Build a transient quote object (same shape as save) for print preview.
  const buildPrintPayload = () => {
    const round2 = (v) => +(Number(v) || 0).toFixed(2);
    const items = pricedLines.filter(l => !l._empty).map((l, idx) => ({
      lineNo: idx + 1, productCode: l.productCode, unit: l.unit, name: l.name, module: l.module, description: l.description,
      pricingModel: l.pricingModel, qty: Number(l.qty) || 0, months: l.effectiveMonths,
      unitPriceResolved: round2(l.unitPriceResolved), discountPct: Number(l.discountPct) || 0,
      billingClass: l.billingClass, monthlyMinimum: round2(l.isVariable ? l.committedPerPeriod : l.monthlyMinimum), lineEstimate: round2(l.lineEstimate),
      lineTotal: round2(l.lineTotal),
    }));
    return {
      quoteNo: (editQuote?.quoteNo || "New quote") + " (preview)", status: needsApproval ? "Approval Required" : "Draft",
      approvalStatus: needsApproval ? "Pending" : "Not Required", paymentTerms: billing.paymentTerms || "",
      billingContactName: billing.billingContactName || "",
      hosting: hostingValue, legalName: billing.legalName || party.name || "", pan: billing.pan || "", gstin: party.gstin || "", billingAddressSnapshot: party.address || "",
      createdDate: today(), preparedBy: me?.name || currentUser, notes,
      items,
      hans: {
        party, currency, intraState: summary.intraState, overallDiscountPct, showDiscount, prepaymentDiscountPct,
        commercialModel: summary.commercialModel, approvalLevel, hostingAsked: hostingNeeded, milestones: hasOneTime ? milestones.filter(m => m.name && Number(m.pct) > 0) : [],
        oneTimeSubtotal: round2(summary.oneTimeSubtotal), recurringSubtotal: round2(summary.recurringSubtotal),
        overallDiscount: round2(summary.overallDiscount), prepaymentDisc: round2(summary.prepaymentDisc),
        taxableBase: round2(summary.taxableBase), cgst: round2(summary.cgst), sgst: round2(summary.sgst),
        igst: round2(summary.igst), grandTotal: round2(summary.grandTotal), alrAnnual: round2(amc.annual), amc,
        tcv: round2(summary.tcv), billingFrequency, terms: QUOTE_TERMS, billing,
        termsText: amc.applies ? [termsText.replace(/\n?AMC: [^\n]*/g, "").trimEnd(), amcTermText(amc, config)].join("\n") : termsText,
      },
    };
  };
  const docOpts = { config, priceRows: catalogue, catalog, termSets: masters?.termSets, preparedBy: { name: me?.name || "", title: me?.designation || "", phone: me?.phone || me?.mobile || "", email: me?.email || "" } };
  const previewPrint = () => printHansQuote(buildPrintPayload(), docOpts);

  // ── Render ──────────────────────────────────────────────────────────
  const planPreset = (key) => {
    const plan = ICAFFE_PLANS[key];
    if (!plan) return;
    setSelectedPlan(key);
    setLines(ls => ls.map(l => isOneTimeModel(catByCode[l.productCode]?.pricingModel) ? l : { ...l, months: plan.months, discountPct: plan.discountPct ?? l.discountPct }));
    if (plan.billingFrequency) setBillingFrequency(plan.billingFrequency);
    if (key === "saasAdvance") { setPrepaymentApplicable(true); setPrepaymentDiscountPct(plan.prepaymentDiscountPct); }
    else if (key === "saasMonthly") { setPrepaymentApplicable(false); }
  };

  const lbl = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)", marginBottom: 3 };
  // Match the app's standard form inputs (.form-group input/select) so the
  // line-grid boxes and terms area look consistent with the rest of the app.
  const fieldStyle = { padding: "7px 9px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 12.5, color: "var(--text)", background: "white", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  // Red asterisk marking a mandatory field (matches the Custom Quote form).
  const Req = () => <span style={{ color: "#DC2626", marginLeft: 2 }}>*</span>;
  const sumRow = (label, val, opts = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: opts.big ? 15 : 12.5, fontWeight: opts.big ? 800 : opts.bold ? 700 : 500, color: opts.color || "var(--text1)", borderTop: opts.divide ? "1px solid var(--border)" : "none", marginTop: opts.divide ? 4 : 0, paddingTop: opts.divide ? 8 : 4 }}>
      <span>{label}</span><span style={{ fontFamily: "'Outfit',sans-serif" }}>{val}</span>
    </div>
  );

  // Column headings for a set of lines (an all-usage set agrees rates, not quantities).
  const renderHeader = (ls) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px 52px 110px 28px", gap: 6, padding: "7px 10px", background: "var(--s2)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text3)" }}>
      <span>Product<Req /></span>
      {ls.length > 0 && ls.every(l => l.isVariable)
        ? <span style={{ gridColumn: "span 2", textAlign: "right" }}>Agreed rate</span>
        : <><span style={{ textAlign: "right" }}>{ls.some(l => l.isVariable) ? "Qty / rate" : "Qty"}</span><span style={{ textAlign: "right" }}>Months</span></>}
      <span style={{ textAlign: "right" }}>Disc%</span><span style={{ textAlign: "right" }}>{ls.length > 0 && ls.every(l => l.isVariable) ? "Billing" : "Line total"}</span><span />
    </div>
  );
  // One quote line. pickRows: the items its product offers (null = every item).
  const renderLine = (l, i, pickRows) => {
    const oneTime = isOneTimeModel(l.pricingModel);
    return (
      <div key={`line-${i}`} style={{ padding: "7px 10px", borderTop: "1px solid var(--border)", background: l.missingRate ? "#FEF2F2" : "transparent" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px 52px 110px 28px", gap: 6, alignItems: "center" }}>
          <select value={l.productCode} onChange={e => {
            // A product with a minimum commitment starts at that minimum.
            const min = Number(catByCode[e.target.value]?.minQty) || 0;
            const isVar = billingClassOf(catByCode[e.target.value] || {}) === "transaction";
            updateLine(i, { productCode: e.target.value, rateText: undefined, ...(isVar ? { qty: 0 } : (Number(l.qty) || 0) < 1 ? { qty: Math.max(1, min) } : min > (Number(l.qty) || 0) ? { qty: min } : {}) });
          }} style={{ ...fieldStyle, cursor: "pointer" }}>
            <option value="">— Pick product —</option>
            {pickRows ? pickRows.map(p => <option key={p.code} value={p.code}>{p.name}</option>) : <>
            {productGroups.general.length > 0 && (
              <optgroup label="Catalogue">
                {productGroups.general.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
              </optgroup>
            )}
            {productGroups.cards.map(([label, items]) => (
              <optgroup key={label} label={`Rate card · ${label}`}>
                {items.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
              </optgroup>
            ))}
            </>}
          </select>
          {l.isVariable ? (
            l.slabRates
              ? <span style={{ gridColumn: "span 2", fontSize: 11, color: "#4338CA", fontWeight: 600, textAlign: "right" }} title="Priced by slab: give a discount % to agree lower slab rates">slab rates</span>
              : <input type="number" min={0} step="any" style={{ ...fieldStyle, gridColumn: "span 2", textAlign: "right", borderColor: "#A5B4FC" }}
                  title={`Agreed rate per ${l.unit || "unit"}: the list rate (${inr2(l.unitPriceResolved)}) or a lower one`}
                  placeholder="Agreed rate"
                  value={l.rateText ?? rateAfterDiscount(l.unitPriceResolved, l.discountPct)}
                  onChange={e => updateLine(i, { rateText: e.target.value, discountPct: e.target.value === "" ? 0 : discountForRate(l.unitPriceResolved, e.target.value) })}
                  onBlur={() => updateLine(i, { rateText: undefined })} />
          ) : (<>
          <input type="number" min={l.minQty || 0} value={l.qty} onChange={e => updateLine(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
            onBlur={() => { if (l.minQty && (Number(l.qty) || 0) < l.minQty) updateLine(i, { qty: l.minQty }); }}
            title={l.isVariable ? `Expected ${String(l.unit || "unit").toLowerCase()}s per month: an internal estimate only. The customer is billed on actual use.` : l.minQty ? `Minimum ${l.minQty} ${String(l.unit || "unit").toLowerCase()}s` : ""}
            style={{ ...fieldStyle, textAlign: "right", border: (Number(l.qty) || 0) < (l.minQty || 0) ? "1.5px solid #DC2626" : fieldStyle.border }} />
          <input type="number" min={1} value={l.months} disabled={oneTime} title={oneTime ? "One-time — months forced to 1" : ""} onChange={e => updateLine(i, { months: +e.target.value })}
            onBlur={() => { if (!oneTime && !(Number(l.months) >= 1)) updateLine(i, { months: 1 }); }} style={{ ...fieldStyle, textAlign: "right", opacity: oneTime ? 0.5 : 1 }} />
          </>)}
          <input type="number" min={0} max={100} value={l.discountPct} onChange={e => updateLine(i, { discountPct: pct0to100(e.target.value), rateText: undefined })} title={l.maxDiscountPct === 0 ? "Any discount on this product needs management approval" : ""}
            style={{ ...fieldStyle, textAlign: "right", color: Number(l.discountPct) > (l.maxDiscountPct ?? config.maxUserDiscountPct) ? "#DC2626" : "var(--text)", fontWeight: Number(l.discountPct) > (l.maxDiscountPct ?? config.maxUserDiscountPct) ? 700 : 400 }} />
          <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600, fontFamily: "'Outfit',sans-serif" }}>
            {l._empty ? "—" : l.isVariable
              ? <span title="Billed on actual consumption: not part of the quote total" style={{ fontSize: 11, fontWeight: 600, color: "#4338CA" }}>{l.lineTotal > 0 ? `min ${inr(l.lineTotal)}` : "on actual use"}</span>
              : inr(l.lineTotal)}
          </span>
          <button className="icon-btn" onClick={() => removeLine(i)} title="Remove"><Trash2 size={13} /></button>
        </div>
        {!l._empty && (
          <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{l.module}</span>·<span>{l.pricingModel}</span>·<span style={{ fontWeight: 700, color: l.isVariable ? "#4338CA" : undefined }}>{billingClassLabel(l.billingClass)}</span>·
            <span>{l.missingRate ? <span style={{ color: "#DC2626", fontWeight: 700 }}>Enter rate in master</span> : l.isVariable ? null : `unit ${inr2(l.unitPriceResolved)}/${l.unit}`}</span>
            {l.minMonthFloor ? <span>· floor {inr(l.minMonthFloor)}/mo</span> : null}
            {l.isVariable ? <span style={{ color: "#4338CA", display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              · {l.slabRates
                ? <>agreed slabs: {l.slabRates.map(sl => `${sl.label} ${inr2(rateAfterDiscount(sl.rate, l.discountPct))}`).join(" · ")}</>
                : <>agreed <b>{inr2(rateAfterDiscount(l.unitPriceResolved, l.discountPct))}</b> per {l.unit}{Number(l.discountPct) > 0 ? ` (list ${inr2(l.unitPriceResolved)}, ${+Number(l.discountPct).toFixed(2)}% off)` : " (list rate)"}</>}
              · billed monthly on actual use
              <span style={{ color: "var(--text3)", display: "inline-flex", gap: 4, alignItems: "center" }}>· expected per month (optional, internal)
                <input type="number" min={0} value={l.qty || ""} placeholder="—" onChange={e => updateLine(i, { qty: +e.target.value || 0 })} style={{ width: 70, fontSize: 10.5, padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 5, textAlign: "right" }} />
                {Number(l.qty) > 0 ? `≈ ${inr(l.grossPerPeriod * (1 - (Number(l.discountPct) || 0) / 100))}/mo, not in the total` : ""}
              </span>
              {!l.variableOpen ? <span style={{ color: "var(--text3)", display: "inline-flex", gap: 4, alignItems: "center" }}>· minimum {inr(l.committedPerPeriod)}/mo committed for
                <input type="number" min={1} value={l.months || 12} onChange={e => updateLine(i, { months: +e.target.value || 1 })} style={{ width: 46, fontSize: 10.5, padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 5, textAlign: "right" }} /> months</span> : null}
            </span> : null}
            {l.agreedNo ? <span style={{ color: "#047857", fontWeight: 600 }}>· customer's agreed rate ({l.agreedNo}){Math.abs((l.liveRate || 0) - l.unitPriceResolved) > 0.005 ? `; price list ${inr2(l.liveRate)}` : ""}</span> : null}
            {l.rateFrozen ? <span style={{ color: "#B45309", fontWeight: 600 }}>· agreed rate kept{Math.abs((l.liveRate || 0) - l.unitPriceResolved) > 0.005 ? ` (price list now ${inr2(l.liveRate)})` : ""}</span> : null}
            {l.minQty ? <span style={{ color: (Number(l.qty) || 0) < l.minQty ? "#DC2626" : undefined, fontWeight: (Number(l.qty) || 0) < l.minQty ? 700 : 400 }}>· minimum {l.minQty} {String(l.unit || "unit").toLowerCase()}s{(Number(l.qty) || 0) < l.minQty ? ` — billed for ${l.minQty}` : ""}</span> : null}
            {l.maxDiscountPct === 0 ? <span>· list price; discount needs approval</span> : null}
            {l.rateCardLabel ? <span style={{ color: "#1E40AF", fontWeight: 600 }}>· {l.rateCardLabel}{l.tierLabel ? ` · tier ${l.tierLabel}` : ""}</span> : l.tierLabel ? <span style={{ color: "#1E40AF", fontWeight: 600 }}>· {l.tierLabel}</span> : null}
          </div>
        )}
      </div>
    );
  };
  const lineEntries = pricedLines.map((l, i) => ({ l, i })).filter(e => !e.l._empty);
  const productPanels = [
    ...productIds.map(id => productOptions.find(o => o.id === id)).filter(Boolean).map(o => ({
      id: o.id, name: o.name, model: o.model, rows: o.rows, sections: rowSections(o.rows),
      lines: lineEntries.filter(e => productIdOfRow(catByCode[e.l.productCode], catalog) === o.id),
    })),
  ];
  // Lines whose product is not among the picked ones (older quotes): shown, never hidden.
  const strays = lineEntries.filter(e => !productIds.includes(productIdOfRow(catByCode[e.l.productCode], catalog)));
  if (strays.length) productPanels.push({ id: "_lines", name: "Other items on this quote", model: null, rows: null, sections: [], lines: strays });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: 20 }} onClick={onClose}>
      <div style={{ width: 1080, maxWidth: "98vw", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", margin: "auto" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>New Quotation <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", background: "var(--s2)", padding: "2px 8px", borderRadius: 10, marginLeft: 6 }}>Hans pricing</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "var(--text3)" }}><span style={{ color: "#DC2626" }}>*</span> required</span>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {saved ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Check size={40} color="#16A34A" />
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 10 }}>Quote {saved.quoteNo} saved</div>
            <div style={{ color: "var(--text3)", fontSize: 13, marginTop: 4 }}>It's in the Quote Register{needsApproval ? " — flagged Approval Required (discount over policy)." : "."}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18 }}>
              <button className="btn btn-sec" onClick={() => printHansQuote(saved, docOpts)}>Print / PDF</button>
              <button className="btn btn-primary" onClick={onClose}>Back to Register</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 340px", gap: 18 }}>
            {/* LEFT: party + lines */}
            <div>
              {/* Opportunity + party */}
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Opportunity<Req /></label>
                  <select value={oppId} onChange={e => onPickOpp(e.target.value)}>
                    <option value="">— Select opportunity —</option>
                    {opps.map(o => <option key={o.id} value={o.id}>{o.title || o.name || o.id}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ width: 150 }}>
                  <label>Segment</label>
                  <select value={segment} onChange={e => setSegment(e.target.value)} title="Drives segment price lists">
                    {QUOTE_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ width: 110 }}>
                  <label>Currency<Req /></label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}>
                    {config.currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}><label>Party name<Req /></label><input value={party.name} onChange={e => setParty({ ...party, name: e.target.value })} placeholder="Auto-filled from opportunity" /></div>
                <div className="form-group" style={{ flex: 1 }}><label>State (place of supply)<Req /></label><input value={party.state} onChange={e => setParty({ ...party, state: e.target.value })} placeholder="e.g. Delhi" /></div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}><label>Address<Req /></label><input value={party.address} onChange={e => setParty({ ...party, address: e.target.value })} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>GSTIN</label><input value={party.gstin} onChange={e => setParty({ ...party, gstin: e.target.value })} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>Country</label><input value={party.country} onChange={e => setParty({ ...party, country: e.target.value })} placeholder="for country pricing" title="Drives per-country band rates" /></div>
              </div>

              {/* Billing & tax — collapsible; auto-filled from the account */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, margin: "8px 0 10px" }}>
                <button type="button" onClick={() => setShowBilling(s => !s)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--s2)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>
                  <span>Billing &amp; tax details {billing.legalName ? "" : <span style={{ fontWeight: 500, color: "var(--text3)" }}>· auto-fills from the customer</span>}</span>
                  <span style={{ fontSize: 11 }}>{showBilling ? "▲ hide" : "▼ show"}</span>
                </button>
                {showBilling && (
                  <div style={{ padding: 12 }}>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 2 }}><label>Legal name</label><input value={billing.legalName} onChange={e => setBill("legalName", e.target.value)} /></div>
                      <div className="form-group" style={{ flex: 1 }}><label>PAN</label><input value={billing.pan} onChange={e => setBill("pan", e.target.value)} /></div>
                      <div className="form-group" style={{ flex: 1 }}><label>Tax treatment</label><input value={billing.taxTreatment} onChange={e => setBill("taxTreatment", e.target.value)} placeholder="e.g. Registered" /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 2 }}><label>Shipping / service address</label><input value={billing.shippingAddress} onChange={e => setBill("shippingAddress", e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}><label>Payment terms<Req /></label><input value={billing.paymentTerms} onChange={e => setBill("paymentTerms", e.target.value)} placeholder="e.g. Net 30" /></div>
                      <div className="form-group" style={{ width: 100 }}><label>Credit days</label><input type="number" min={0} value={billing.creditDays} onChange={e => setBill("creditDays", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                      <div className="form-group" style={{ width: 120 }}><label>PO mandatory?</label><select value={billing.poMandatory} onChange={e => setBill("poMandatory", e.target.value)}><option value="">—</option><option>Yes</option><option>No</option></select></div>
                      <div className="form-group" style={{ flex: 1 }}><label>PO number</label><input value={billing.poNumber} onChange={e => setBill("poNumber", e.target.value)} /></div>
                    </div>
                    {/* Billing contact — pick an existing account contact or type a new one */}
                    <div style={{ ...lbl, margin: "4px 0 4px" }}>Billing contact (for invoicing & follow-up)</div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Pick existing</label>
                        <select value="" onChange={e => { if (e.target.value) applyContact("billing", e.target.value); }} disabled={accountContacts.length === 0}>
                          <option value="">{accountContacts.length ? "— Select account contact —" : "No account contacts"}</option>
                          {accountContacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.designation ? ` · ${c.designation}` : ""}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}><label>Name</label><input value={billing.billingContactName} onChange={e => setBill("billingContactName", e.target.value)} placeholder="Or type a new contact" /></div>
                      <div className="form-group" style={{ flex: 1 }}><label>Email<Req /></label><input value={billing.billingContactEmail} onChange={e => setBill("billingContactEmail", e.target.value)} /></div>
                      <div className="form-group" style={{ flex: 1 }}><label>Phone</label><input value={billing.billingContactPhone} onChange={e => setBill("billingContactPhone", e.target.value)} /></div>
                    </div>
                    {/* Finance / AP contact — accounts payable / billing follow-up */}
                    <div style={{ ...lbl, margin: "8px 0 4px" }}>Finance / AP contact (for payment follow-up)</div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Pick existing</label>
                        <select value="" onChange={e => { if (e.target.value) applyContact("finance", e.target.value); }} disabled={accountContacts.length === 0}>
                          <option value="">{accountContacts.length ? "— Select account contact —" : "No account contacts"}</option>
                          {accountContacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.designation ? ` · ${c.designation}` : ""}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}><label>Name</label><input value={billing.financeContactName} onChange={e => setBill("financeContactName", e.target.value)} placeholder="Or type a new contact" /></div>
                      <div className="form-group" style={{ flex: 1 }}><label>Email</label><input value={billing.financeContactEmail} onChange={e => setBill("financeContactEmail", e.target.value)} /></div>
                      <div className="form-group" style={{ flex: 1 }}><label>Phone</label><input value={billing.financeContactPhone} onChange={e => setBill("financeContactPhone", e.target.value)} /></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Products on this quote */}
              <div style={{ margin: "4px 0 10px" }}>
                <div style={{ ...lbl, marginBottom: 6 }}>Products on this quote<Req /></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {productOptions.map(o => {
                    const on = productIds.includes(o.id);
                    return <button key={o.id} type="button" className={`btn btn-xs ${on ? "btn-primary" : "btn-sec"}`} title={o.model?.label || ""} onClick={() => toggleProduct(o.id)}>{on && <Check size={11} />}{o.name}</button>;
                  })}
                </div>
                {productIds.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 6 }}>Pick the product, or products, you are quoting. The screen then shows only their plans, services and charges{oppId ? "" : " (picking an opportunity fills in the products on the deal)"}.</div>}
              </div>

              {/* Plan presets */}
              {picked.length > 0 && !hasSubscription && (
                <div style={{ fontSize: 11.5, color: "#4338CA", background: "#EEF2FF", borderRadius: 8, padding: "6px 10px", margin: "6px 0 10px" }}>
                  {picked.every(l => l.isVariable) ? "Billed monthly on actual usage. Enter the agreed rate for each service: the list rate or a lower one." : "One-time and usage charges only: no subscription plan or billing cycle to choose."}
                  {!hostingNeeded ? " Hosted by Hans Infomatic." : ""}
                </div>
              )}
              <div style={{ display: hasSubscription || (picked.length > 0 && hostingNeeded) ? "flex" : "none", gap: 8, alignItems: "center", margin: "6px 0 10px", flexWrap: "wrap" }}>
                {hasSubscription && <>
                {productIds.includes("iCAFFE") && <>
                <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>iCAFFE plan:</span>
                <button className={`btn btn-xs ${selectedPlan === "saasMonthly" ? "btn-primary" : "btn-sec"}`} onClick={() => planPreset("saasMonthly")}>{selectedPlan === "saasMonthly" && <Check size={11} />}SaaS Monthly (12mo)</button>
                <button className={`btn btn-xs ${selectedPlan === "saasAdvance" ? "btn-primary" : "btn-sec"}`} onClick={() => planPreset("saasAdvance")}>{selectedPlan === "saasAdvance" && <Check size={11} />}SaaS Advance (12mo, 10% prepay)</button>
                <button className={`btn btn-xs ${selectedPlan === "otpArr" ? "btn-primary" : "btn-sec"}`} onClick={() => planPreset("otpArr")}>{selectedPlan === "otpArr" && <Check size={11} />}OTP+ARR (42mo, 45% disc)</button>
                </>}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>Billed</span>
                  <select value={billingFrequency} onChange={e => setBillingFrequency(e.target.value)} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    {BILLING_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </span>
                </>}
                {picked.length > 0 && hostingNeeded && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                  <span style={{ fontSize: 11, color: hosting ? "var(--text3)" : "#B45309", fontWeight: 600 }}>Hosting<Req /></span>
                  <select value={hosting} onChange={e => setHosting(e.target.value)} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: `1px solid ${hosting ? "var(--border)" : "#F59E0B"}` }}>
                    <option value="">— Select —</option>
                    {HOSTING_OPTIONS.map(o => <option key={o} value={o}>{HOSTING_LABEL[o]}</option>)}
                  </select>
                </span>}
              </div>

              {/* Items, product by product */}
              {productPanels.map(pn => (
                <div key={pn.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--s2)", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{pn.name}</span>
                    {pn.model?.label && pn.model.key && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#4338CA", background: "#EEF2FF", padding: "1px 8px", borderRadius: 10 }}>{pn.model.label}</span>}
                    {pn.id !== "_lines" && <button className="icon-btn" style={{ marginLeft: "auto" }} title={`Remove ${pn.name} from this quote`} onClick={() => toggleProduct(pn.id)}><X size={13} /></button>}
                  </div>
                  {pn.sections.length > 0 && (
                    <div style={{ padding: "8px 10px 4px" }}>
                      {pn.sections.map(sec => (
                        <div key={sec.key} style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: sec.key === "transaction" ? "#4338CA" : "var(--text3)", flexBasis: "100%" }}>{sec.label}</span>
                          {sec.rows.map(r => {
                            const on = lines.some(l => l.productCode === r.code);
                            const hint = rowPriceHint(r);
                            return (
                              <button key={r.code} type="button" className={`btn btn-xs ${on ? "btn-primary" : "btn-sec"}`} title={`${r.code} · ${r.name}${r.description ? `\n${r.description}` : ""}`} onClick={() => toggleRow(r)}>
                                {on ? <Check size={11} /> : <Plus size={11} />}{chipLabel(r, pn.name)}{hint ? <span style={{ opacity: 0.75, fontWeight: 500 }}>&nbsp;· {hint}</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                  {pn.lines.length > 0
                    ? <>{renderHeader(pn.lines.map(e => e.l))}{pn.lines.map(e => renderLine(e.l, e.i, pn.rows))}</>
                    : pn.sections.length > 0 && <div style={{ padding: "0 10px 8px", fontSize: 11.5, color: "var(--text3)" }}>Click an item above to add it.</div>}
                </div>
              ))}

              <div className="form-group" style={{ marginTop: 12 }}><label>Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>

              {/* Terms & conditions — templates + free text + standard-term chips */}
              <div style={{ marginTop: 12 }}>
                <div style={{ ...lbl, marginBottom: 6 }}>Terms &amp; conditions</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                  {TC_TEMPLATES.map(t => (
                    <button key={t.id} type="button" className="btn btn-sec btn-xs" onClick={() => setTermsText(t.body)}>{t.name}</button>
                  ))}
                  <button type="button" className="btn btn-sec btn-xs" style={{ color: "#DC2626" }} onClick={() => setTermsText("")}>Clear</button>
                </div>
                <textarea rows={6} value={termsText} onChange={e => setTermsText(e.target.value)} placeholder="Pick a template above or type your own terms…" style={{ ...fieldStyle, resize: "vertical", fontFamily: "monospace", lineHeight: 1.5 }} />
                <div style={{ ...lbl, margin: "8px 0 4px" }}>Standard terms (click to add)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STANDARD_TERMS.map((t, i) => (
                    <button key={i} type="button" className="btn btn-sec btn-xs" style={{ fontSize: 10, maxWidth: 280, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t} onClick={() => setTermsText(prev => prev ? prev + "\n" + t : t)}>{t.substring(0, 48)}…</button>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT: live summary + guardrails */}
            <div>
              <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={lbl}>Summary {summary.intraState ? "· intra-state (CGST+SGST)" : "· inter-state (IGST)"}</div>
                <div style={{ fontSize: 11.5, marginBottom: 4 }}><span style={{ background: "#EEF2FF", color: "#4338CA", fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{summary.commercialModel?.label || "Not classified"}</span></div>
                {sumRow("One-time subtotal", inr(summary.oneTimeSubtotal))}
                {sumRow("Fixed recurring subtotal", inr(summary.recurringSubtotal))}
                {summary.variableLineCount > 0 && (summary.variableEstimateMonthly > 0
                  ? sumRow("Variable, on actual use (estimate, not in total)", `${inr(summary.variableEstimateMonthly)}/mo`, { color: "#4338CA" })
                  : sumRow(`Variable (${summary.variableLineCount} service${summary.variableLineCount > 1 ? "s" : ""})`, "billed on actual use", { color: "#4338CA" }))}
                <div className="form-row" style={{ margin: "6px 0", gap: 6 }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label style={lbl}>Overall disc %</label><input type="number" min={0} max={100} value={overallDiscountPct} onChange={e => setOverallDiscountPct(pct0to100(e.target.value))} /></div>
                </div>
                {summary.overallDiscount > 0 && sumRow("Overall discount", "− " + inr(summary.overallDiscount), { color: "#B91C1C" })}
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, margin: "6px 0" }}>
                  <input type="checkbox" checked={prepaymentApplicable} onChange={e => setPrepaymentApplicable(e.target.checked)} />
                  Prepayment discount
                  <input type="number" min={0} max={100} value={prepaymentDiscountPct} disabled={!prepaymentApplicable} onChange={e => setPrepaymentDiscountPct(pct0to100(e.target.value))} style={{ width: 52, marginLeft: "auto" }} />%
                </label>
                {summary.prepaymentDisc > 0 && sumRow("Prepayment discount", "− " + inr(summary.prepaymentDisc), { color: "#B91C1C" })}
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, margin: "6px 0 2px", cursor: "pointer" }} title="On: the customer sees list rate, discount % and net. Off: only the net rates are printed.">
                  <input type="checkbox" checked={showDiscount} onChange={e => setShowDiscount(e.target.checked)} />
                  Show discount on the customer quote
                </label>
                {sumRow("Taxable value", inr(summary.taxableBase), { bold: true, divide: true })}
                {summary.cgst > 0 && sumRow(`CGST ${config.gstRatePct / 2}%`, inr(summary.cgst))}
                {summary.sgst > 0 && sumRow(`SGST ${config.gstRatePct / 2}%`, inr(summary.sgst))}
                {summary.igst > 0 && sumRow(`IGST ${config.gstRatePct}%`, inr(summary.igst))}
                {sumRow("Grand Total (upfront)", inr(summary.grandTotal), { big: true, divide: true })}
                {amc.applies && sumRow(`AMC per year (from year ${amc.terms.startYear}, billed separately)`, inr(amc.annual), { color: "var(--text3)" })}
                {sumRow(summary.variableLineCount > 0 ? "TCV (committed only)" : "TCV", inr(summary.tcv), { bold: true })}
                {summary.recurringSubtotal > 0 && sumRow("Billing", billingFrequency, { color: "var(--text3)" })}
              </div>

              {/* AMC on one-time licences */}
              {amc.applies && (
                <div style={{ marginTop: 10, border: `1px solid ${amc.breached ? "#FDE68A" : "var(--border)"}`, background: amc.breached ? "#FFFBEB" : "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 11.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <b>AMC</b>
                    <span style={{ color: "var(--text3)" }}>{[...new Set(amc.lines.map(l => l.pct))].join("% / ")}% of licence · from year {amc.terms.startYear} · {describeEscalation(amc.terms)}</span>
                    <button type="button" className="btn btn-xs btn-sec" style={{ marginLeft: "auto" }} onClick={() => setShowAmcEdit(s => !s)}>{showAmcEdit ? "Done" : "Change AMC terms"}</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
                    <tbody>
                      {amc.schedule.map(y => (
                        <tr key={y.amcYear}><td style={{ padding: "2px 0", color: "var(--text3)" }}>Year {y.contractYear}</td><td style={{ textAlign: "right", fontFamily: "'Outfit',sans-serif" }}>{inr(y.amount)}</td></tr>
                      ))}
                      <tr><td style={{ padding: "3px 0", fontWeight: 700, borderTop: "1px solid var(--border)" }}>AMC, {amc.schedule.length} years (+ GST)</td><td style={{ textAlign: "right", fontWeight: 700, borderTop: "1px solid var(--border)", fontFamily: "'Outfit',sans-serif" }}>{inr(amc.scheduleTotal)}</td></tr>
                    </tbody>
                  </table>
                  {showAmcEdit && (() => {
                    const rules = amcRules(config);
                    const set = (k, v) => setAmcOverrides(o => { const n = { ...o }; if (v === "" || v == null) delete n[k]; else n[k] = Number(v); return n; });
                    const setLine = (code, v) => setAmcOverrides(o => { const lp = { ...(o.linePct || {}) }; if (v === "" || v == null) delete lp[code]; else lp[code] = Number(v); return { ...o, linePct: lp }; });
                    const inp = { width: 54, padding: "3px 5px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 11.5 };
                    return (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ color: "#92400E" }}>Changing any of these sends the quote for approval. Leave a box empty to use the company rule.</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>Starts in contract year
                          <select value={amcOverrides.startYear ?? ""} onChange={e => set("startYear", e.target.value)} style={{ ...inp, width: 150 }}>
                            <option value="">{rules.startYear} (rule)</option>
                            {[1, 2, 3, 4].filter(y => y !== rules.startYear).map(y => <option key={y} value={y}>{y === 1 ? "1 — from go-live" : y}</option>)}
                          </select>
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>Fixed for
                          <input type="number" min={0} placeholder={rules.fixedYears} value={amcOverrides.fixedYears ?? ""} onChange={e => set("fixedYears", e.target.value)} style={inp} /> yrs, then +
                          <input type="number" min={0} placeholder={rules.escalationPct} value={amcOverrides.escalationPct ?? ""} onChange={e => set("escalationPct", e.target.value)} style={inp} />% every
                          <input type="number" min={1} placeholder={rules.escalationEvery} value={amcOverrides.escalationEvery ?? ""} onChange={e => set("escalationEvery", e.target.value)} style={inp} /> yrs
                        </div>
                        {amc.lines.map(l => (
                          <label key={l.productCode} style={{ display: "flex", alignItems: "center", gap: 6 }}>{l.name}: AMC
                            <input type="number" min={0} max={100} placeholder={l.rulePct} value={amcOverrides.linePct?.[l.productCode] ?? ""} onChange={e => setLine(l.productCode, e.target.value)} style={inp} />% per year
                          </label>
                        ))}
                        {Object.keys(amcOverrides).length > 0 && <button type="button" className="btn btn-xs btn-sec" style={{ alignSelf: "flex-start" }} onClick={() => setAmcOverrides({})}>Back to the company rules</button>}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Guardrail banners */}
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {frozen && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "7px 10px" }}>
                  <Info size={14} /> This quote was {editQuote?.status === "Accepted" ? "accepted" : editQuote?.approvalStatus === "Approved" ? "approved" : "sent"}: its lines keep the agreed rates, whatever the price list says now.
                  <button type="button" className="btn btn-xs btn-sec" onClick={() => { if (window.confirm("Re-price every line from the current price list? The agreed rates are replaced, and the change is recorded on the quote.")) setFrozen(false); }}>Re-price from the price list</button>
                </div>}
                {repriced && <Banner color="#1E40AF" bg="#EFF6FF" icon={<Info size={14} />} text="Re-priced from the current price list. This is recorded on the quote when you save." />}
                {Object.keys(agreedLines).length > 0 && !frozen && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#065F46", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                    <input type="checkbox" checked={useAgreed} onChange={e => setUseAgreed(e.target.checked)} />
                    This customer has agreed rates for {Object.keys(agreedLines).length} component{Object.keys(agreedLines).length > 1 ? "s" : ""} ({[...new Set(Object.values(agreedLines).map(v => v.agreement.agreementNo))].join(", ")}). Use them on this quote{pricedLines.some(l => l.agreedNo) ? `: ${pricedLines.filter(l => l.agreedNo).length} line(s) priced from the agreement` : ""}.
                  </label>
                )}
                {needsApproval && <Banner color="#B45309" bg="#FFFBEB" icon={<AlertTriangle size={14} />} text={`Approval required${approvalLevel ? ` (${approvalLevel.label}${approvalLevel.discountPct ? `, discount ${approvalLevel.discountPct}%` : ""})` : ""} — ${approvalReasons.join("; ")}`} />}
                {hasOneTime && (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }} onChangeCapture={() => setMilestonesTouched(true)} onClickCapture={(e) => { if (e.target.closest("button")) setMilestonesTouched(true); }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>One-time charges: payment milestones</div>
                    {milestones.map((m, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 58px 70px 24px", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <input value={m.name} placeholder="Milestone" onChange={e => setMilestones(ms => ms.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ ...fieldStyle, fontSize: 12 }} />
                        <input type="number" min={0} max={100} value={m.pct} onChange={e => setMilestones(ms => ms.map((x, j) => j === i ? { ...x, pct: +e.target.value } : x))} style={{ ...fieldStyle, textAlign: "right", fontSize: 12 }} title="% of the one-time charges" />
                        <span style={{ textAlign: "right", color: "var(--text3)" }}>{inr(summary.oneTimeSubtotal * (1 - overallDiscountPct / 100) * (Number(m.pct) || 0) / 100)}</span>
                        <button className="icon-btn" title="Remove" onClick={() => setMilestones(ms => ms.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <button type="button" className="btn btn-xs btn-sec" onClick={() => setMilestones(ms => [...ms, { name: "", pct: Math.max(0, 100 - milestoneSum) }])}><Plus size={11} /> Add milestone</button>
                      <span style={{ color: milestoneSum === 100 ? "var(--text3)" : "#B91C1C", fontWeight: milestoneSum === 100 ? 400 : 700 }}>Total {milestoneSum}%{milestoneSum === 100 ? "" : " (must be 100%)"}</span>
                    </div>
                  </div>
                )}
                {!ccsRule.ok && <Banner color="#B91C1C" bg="#FEF2F2" icon={<AlertTriangle size={14} />} text={ccsRule.error} />}
                {ccsRule.ok && usesBothCcs && <Banner color="#B45309" bg="#FFFBEB" icon={<Info size={14} />} text="Quote uses both CC03 and CC04 — confirm CC03 is priced above CC04." />}
                {whRule.warning && <Banner color="#B45309" bg="#FFFBEB" icon={<AlertTriangle size={14} />} text={whRule.warning} />}
                {missingRateLines.length > 0 && <Banner color="#B91C1C" bg="#FEF2F2" icon={<AlertTriangle size={14} />} text={`${missingRateLines.length} line(s) have no rate — enter the rate in the master before saving.`} />}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-sec" style={{ flex: "0 0 auto" }} disabled={!pricedLines.some(l => !l._empty)} onClick={previewPrint} title="Preview the client-facing document">Preview</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={!canSave || saving} onClick={save}>
                  {needsApproval ? "Save (route for approval)" : "Save quote"}
                </button>
              </div>
              {!canSave && <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 6, textAlign: "center" }}>Pick an opportunity, a party{hostingNeeded ? ", hosting (Hans / Client)" : ""}, at least one priced line (no missing rates).</div>}
              {canSave && billingMissing.length > 0 && (
                <div style={{ fontSize: 10.5, color: "#B45309", marginTop: 6, textAlign: "center", cursor: "pointer" }} onClick={() => setShowBilling(true)} title="Open Billing & tax details">
                  {billingMissing.length} billing detail{billingMissing.length > 1 ? "s" : ""} missing: {billingMissing.join(", ")} — click to complete.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function bucketBadge(pm) {
  return isOneTimeModel(pm) ? "One-time" : "Recurring";
}
function Banner({ color, bg, icon, text }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: bg, color, border: `1px solid ${color}33`, borderRadius: 8, padding: "7px 10px", fontSize: 11.5, fontWeight: 600 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span><span>{text}</span>
    </div>
  );
}

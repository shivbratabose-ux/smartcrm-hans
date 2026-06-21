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

import { useState, useMemo } from "react";
import { Plus, Trash2, X, AlertTriangle, Check, Info } from "lucide-react";
import {
  QUOTE_CONFIG, HANS_CATALOGUE, PRICING_BANDS, ICAFFE_EDITIONS,
  ICAFFE_BAND_FROM, ICAFFE_PLANS, QUOTE_TERMS, BILLING_FREQUENCIES, QUOTE_SEGMENTS,
} from "../data/quotationMasters";
import {
  resolveUnitPrice, computeLine, computeQuote, isOneTimeModel,
  evaluateDiscountGuardrail, evaluateMarginGuardrail, validateCcsRule, validateWiseHandlingModules,
  formatQuoteNumber,
} from "../lib/quotation/pricingEngine";
import { TC_TEMPLATES, STANDARD_TERMS } from "../data/constants";
import { printHansQuote } from "../lib/quotation/printQuote";

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const inr2 = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BLANK_LINE = { productCode: "", qty: 1, months: 12, discountPct: 0 };

export default function HansQuoteBuilder({
  opps = [], leads = [], accounts = [], contacts = [],
  quotes = [], setQuotes, currentUser, orgUsers = [], onClose,
  masters = null, editQuote = null,
}) {
  // Masters resolve from persisted overrides if present, else seeded defaults.
  const config = masters?.quoteConfig || QUOTE_CONFIG;
  const catalogue = (masters?.catalogue && masters.catalogue.length ? masters.catalogue : HANS_CATALOGUE).filter(p => p.active !== false);
  const bands = masters?.bands || PRICING_BANDS;
  const editions = masters?.editions || ICAFFE_EDITIONS;
  const bandFrom = masters?.bandFrom || ICAFFE_BAND_FROM;
  const catByCode = useMemo(() => Object.fromEntries(catalogue.map(p => [p.code, p])), [catalogue]);

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
  const [overallDiscountPct, setOverallDiscountPct] = useState(eh?.overallDiscountPct || 0);
  const [prepaymentApplicable, setPrepaymentApplicable] = useState(!!eh?.prepaymentApplicable);
  const [prepaymentDiscountPct, setPrepaymentDiscountPct] = useState(eh?.prepaymentDiscountPct ?? config.prepaymentDiscountPctDefault);
  const [notes, setNotes] = useState(editQuote?.notes || "");
  // Terms & conditions (free text). Seed from the edited quote, else the
  // default Hans terms as a sensible starting block the rep can replace via
  // a template. Same field (quote.terms) the Custom Quote / print use.
  const defaultTermsText = QUOTE_TERMS.map((t, i) => `${i + 1}. ${t.text}`).join("\n");
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
      ? editQuote.items.map(it => ({ productCode: it.productCode || "", qty: Number(it.qty) || 1, months: Number(it.months) || 1, discountPct: Number(it.discountPct) || 0 }))
      : [{ ...BLANK_LINE }]
  );
  const [saved, setSaved] = useState(null);

  // Resolve party from the picked opportunity. The app's opportunities
  // link to an account (existing customer) and/or a source lead (new).
  const onPickOpp = (id) => {
    setOppId(id);
    const opp = opps.find(o => o.id === id);
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
  const addLine = () => setLines(ls => [...ls, { ...BLANK_LINE }]);
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i));
  const updateLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  // The quote date drives effective-dated (scheduled) rates — an edited
  // quote keeps its original date; a new one prices as of today.
  const quoteDate = editQuote?.createdDate || today();
  // FX divisor for the selected currency (INR base → /fxToInr). A product
  // with an explicit native price for the currency bypasses this entirely.
  const fxForCurrency = (config.currencies || []).find(c => c.code === currency)?.fxToInr || Number(config.fx) || 1;
  // Enrich each line with its catalogue snapshot + resolved unit price,
  // shaped exactly as the engine expects.
  const pricedLines = useMemo(() => lines.map(l => {
    const p = catByCode[l.productCode];
    if (!p) return { ...l, _empty: true, pricingModel: "", unitPriceResolved: 0, missingRate: false };
    const { unitPrice, missingRate } = resolveUnitPrice(p, { qty: l.qty, bands, editions, bandFrom, config, fx: fxForCurrency, asOf: quoteDate, segment, currency, country: party.country });
    const oneTime = isOneTimeModel(p.pricingModel);
    return {
      ...l,
      productCode: p.code, name: p.name, module: p.module, description: p.description,
      pricingModel: p.pricingModel, unit: p.unit, minMonthFloor: p.minMonthFloor,
      unitPriceResolved: unitPrice, missingRate,
      // Per-unit cost (same scale as the resolved unit price) for the margin
      // guardrail — only present when the product has a cost in masters.
      costPerUnit: p.costPrice != null ? (Number(p.costPrice) || 0) / fxForCurrency : null,
      months: oneTime ? 1 : l.months,
      ...computeLine({ pricingModel: p.pricingModel, unitPriceResolved: unitPrice, qty: l.qty, months: oneTime ? 1 : l.months, discountPct: l.discountPct, minMonthFloor: p.minMonthFloor }),
    };
  }), [lines, catByCode, bands, editions, bandFrom, config, quoteDate, segment, currency, fxForCurrency, party.country]);

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
  const needsApproval = discGuard.breached || marginGuard.breached;

  // ── Save ────────────────────────────────────────────────────────────
  const canSave = oppId && party.name && pricedLines.some(l => !l._empty) && missingRateLines.length === 0;

  // Advisory billing-completeness hint (doesn't block save — the engine only
  // needs opp + party + a priced line). Mirrors the Custom Quote's verify intent.
  const billingMissing = [
    !party.address && "Billing address",
    !party.gstin && "GSTIN",
    !billing.billingContactEmail && "Billing contact email",
    !billing.paymentTerms && "Payment terms",
  ].filter(Boolean);

  // Internal id from the max existing QT- sequence (not array length, which
  // collides after a deletion or against the legacy builder in the same session).
  const nextQuoteId = () => {
    const max = quotes.reduce((m, q) => {
      const x = typeof q.id === "string" && q.id.match(/^QT-(\d+)$/);
      return x ? Math.max(m, parseInt(x[1], 10)) : m;
    }, 0);
    return `QT-${String(max + 1).padStart(3, "0")}`;
  };

  const nextQuoteNo = () => {
    // Per-FY incrementing sequence across engine-built quotes.
    const fy = formatQuoteNumber(0).split("/").pop();
    const seqs = quotes
      .filter(q => typeof q.quoteNo === "string" && q.quoteNo.endsWith(fy) && q.quoteNo.startsWith(config.quoteNumberPrefix))
      .map(q => parseInt(q.quoteNo.replace(config.quoteNumberPrefix, ""), 10) || 0);
    const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
    return formatQuoteNumber(next);
  };

  const save = () => {
    if (!canSave || !setQuotes) return;
    const opp = opps.find(o => o.id === oppId);
    const isEdit = !!editQuote;
    const quoteNo = isEdit ? (editQuote.quoteNo || nextQuoteNo()) : nextQuoteNo();
    const id = isEdit ? editQuote.id : nextQuoteId();
    const items = pricedLines.filter(l => !l._empty).map((l, idx) => ({
      lineNo: idx + 1, productCode: l.productCode, name: l.name, module: l.module,
      description: l.description, pricingModel: l.pricingModel, unit: l.unit,
      unitPriceResolved: +l.unitPriceResolved.toFixed(2), qty: Number(l.qty) || 0,
      months: l.effectiveMonths, discountPct: Number(l.discountPct) || 0,
      minMonthFloor: l.minMonthFloor ?? null,
      lineOneTime: +l.lineOneTime.toFixed(2), lineRecurring: +l.lineRecurring.toFixed(2),
      lineTotal: +l.lineTotal.toFixed(2),
    }));
    // Additive engine breakdown — absolute ₹, rounded to paise.
    const round2 = (v) => +(Number(v) || 0).toFixed(2);
    const hans = {
      pricingMode: "hans-engine",
      party, currency,
      overallDiscountPct, prepaymentApplicable, prepaymentDiscountPct,
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
      alrAnnual: round2(summary.alrAnnual),
      tcv: round2(summary.tcv),
      intraState: summary.intraState,
      billingFrequency, // invoicing cadence (Monthly / Quarterly / …)
      segment, // customer segment driving segment price lists
      plan: selectedPlan, // chosen iCAFFE plan preset (for re-seed on edit)
      terms: QUOTE_TERMS,
      termsText, // the rep's edited T&C (rendered by print)
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
      owner: isEdit ? (editQuote.owner || currentUser) : currentUser,
      createdDate: isEdit ? (editQuote.createdDate || today()) : today(),
      terms: termsText, // legacy/register/verify read quote.terms
      ...billingSnapshot,
      items, hans,
    };
    // Edit → replace by id (preserving other fields like changeLog/emailLog);
    // create → append.
    if (isEdit) setQuotes(p => p.map(r => r.id === id ? { ...r, ...quote } : r));
    else setQuotes(p => [...p, quote]);
    setSaved(quote);
  };

  // Build a transient quote object (same shape as save) for print preview.
  const buildPrintPayload = () => {
    const round2 = (v) => +(Number(v) || 0).toFixed(2);
    const items = pricedLines.filter(l => !l._empty).map((l, idx) => ({
      lineNo: idx + 1, name: l.name, module: l.module, description: l.description,
      pricingModel: l.pricingModel, qty: Number(l.qty) || 0, months: l.effectiveMonths,
      unitPriceResolved: round2(l.unitPriceResolved), discountPct: Number(l.discountPct) || 0,
      lineTotal: round2(l.lineTotal),
    }));
    return {
      quoteNo: nextQuoteNo() + " (preview)", status: needsApproval ? "Approval Required" : "Draft",
      createdDate: today(), preparedBy: me?.name || currentUser, notes,
      items,
      hans: {
        party, currency, intraState: summary.intraState,
        oneTimeSubtotal: round2(summary.oneTimeSubtotal), recurringSubtotal: round2(summary.recurringSubtotal),
        overallDiscount: round2(summary.overallDiscount), prepaymentDisc: round2(summary.prepaymentDisc),
        taxableBase: round2(summary.taxableBase), cgst: round2(summary.cgst), sgst: round2(summary.sgst),
        igst: round2(summary.igst), grandTotal: round2(summary.grandTotal), alrAnnual: round2(summary.alrAnnual),
        tcv: round2(summary.tcv), billingFrequency, terms: QUOTE_TERMS, termsText, billing,
      },
    };
  };
  const previewPrint = () => printHansQuote(buildPrintPayload());

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
              <button className="btn btn-sec" onClick={() => printHansQuote(saved)}>Print / PDF</button>
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

              {/* Plan presets */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0 10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>iCAFFE plan:</span>
                <button className={`btn btn-xs ${selectedPlan === "saasMonthly" ? "btn-primary" : "btn-sec"}`} onClick={() => planPreset("saasMonthly")}>{selectedPlan === "saasMonthly" && <Check size={11} />}SaaS Monthly (12mo)</button>
                <button className={`btn btn-xs ${selectedPlan === "saasAdvance" ? "btn-primary" : "btn-sec"}`} onClick={() => planPreset("saasAdvance")}>{selectedPlan === "saasAdvance" && <Check size={11} />}SaaS Advance (12mo, 10% prepay)</button>
                <button className={`btn btn-xs ${selectedPlan === "otpArr" ? "btn-primary" : "btn-sec"}`} onClick={() => planPreset("otpArr")}>{selectedPlan === "otpArr" && <Check size={11} />}OTP+ARR (42mo, 45% disc)</button>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>Billed</span>
                  <select value={billingFrequency} onChange={e => setBillingFrequency(e.target.value)} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    {BILLING_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </span>
              </div>

              {/* Line grid */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px 52px 110px 28px", gap: 6, padding: "7px 10px", background: "var(--s2)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text3)" }}>
                  <span>Product<Req /></span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Months</span><span style={{ textAlign: "right" }}>Disc%</span><span style={{ textAlign: "right" }}>Line total</span><span />
                </div>
                {pricedLines.map((l, i) => {
                  const oneTime = isOneTimeModel(l.pricingModel);
                  return (
                    <div key={i} style={{ padding: "7px 10px", borderTop: "1px solid var(--border)", background: l.missingRate ? "#FEF2F2" : "transparent" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px 52px 110px 28px", gap: 6, alignItems: "center" }}>
                        <select value={l.productCode} onChange={e => updateLine(i, { productCode: e.target.value })} style={{ ...fieldStyle, cursor: "pointer" }}>
                          <option value="">— Pick product —</option>
                          {catalogue.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                        </select>
                        <input type="number" min={0} value={l.qty} onChange={e => updateLine(i, { qty: +e.target.value })} style={{ ...fieldStyle, textAlign: "right" }} />
                        <input type="number" min={1} value={l.months} disabled={oneTime} title={oneTime ? "One-time — months forced to 1" : ""} onChange={e => updateLine(i, { months: +e.target.value })} style={{ ...fieldStyle, textAlign: "right", opacity: oneTime ? 0.5 : 1 }} />
                        <input type="number" min={0} max={100} value={l.discountPct} onChange={e => updateLine(i, { discountPct: +e.target.value })} style={{ ...fieldStyle, textAlign: "right", color: Number(l.discountPct) > config.maxUserDiscountPct ? "#DC2626" : "var(--text)", fontWeight: Number(l.discountPct) > config.maxUserDiscountPct ? 700 : 400 }} />
                        <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600, fontFamily: "'Outfit',sans-serif" }}>{l._empty ? "—" : inr(l.lineTotal)}</span>
                        <button className="icon-btn" onClick={() => removeLine(i)} title="Remove"><Trash2 size={13} /></button>
                      </div>
                      {!l._empty && (
                        <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span>{l.module}</span>·<span>{l.pricingModel}</span>·<span>{bucketBadge(l.pricingModel)}</span>·
                          <span>{l.missingRate ? <span style={{ color: "#DC2626", fontWeight: 700 }}>Enter rate in master</span> : `unit ${inr2(l.unitPriceResolved)}/${l.unit}`}</span>
                          {l.minMonthFloor ? <span>· floor {inr(l.minMonthFloor)}/mo</span> : null}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button className="btn btn-sec btn-xs" style={{ margin: 8 }} onClick={addLine}><Plus size={12} /> Add line</button>
              </div>

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
                {sumRow("One-time subtotal", inr(summary.oneTimeSubtotal))}
                {sumRow("Recurring subtotal", inr(summary.recurringSubtotal))}
                <div className="form-row" style={{ margin: "6px 0", gap: 6 }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label style={lbl}>Overall disc %</label><input type="number" min={0} max={100} value={overallDiscountPct} onChange={e => setOverallDiscountPct(+e.target.value)} /></div>
                </div>
                {summary.overallDiscount > 0 && sumRow("Overall discount", "− " + inr(summary.overallDiscount), { color: "#B91C1C" })}
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, margin: "6px 0" }}>
                  <input type="checkbox" checked={prepaymentApplicable} onChange={e => setPrepaymentApplicable(e.target.checked)} />
                  Prepayment discount
                  <input type="number" min={0} max={100} value={prepaymentDiscountPct} disabled={!prepaymentApplicable} onChange={e => setPrepaymentDiscountPct(+e.target.value)} style={{ width: 52, marginLeft: "auto" }} />%
                </label>
                {summary.prepaymentDisc > 0 && sumRow("Prepayment discount", "− " + inr(summary.prepaymentDisc), { color: "#B91C1C" })}
                {sumRow("Taxable value", inr(summary.taxableBase), { bold: true, divide: true })}
                {summary.cgst > 0 && sumRow(`CGST ${config.gstRatePct / 2}%`, inr(summary.cgst))}
                {summary.sgst > 0 && sumRow(`SGST ${config.gstRatePct / 2}%`, inr(summary.sgst))}
                {summary.igst > 0 && sumRow(`IGST ${config.gstRatePct}%`, inr(summary.igst))}
                {sumRow("Grand Total (upfront)", inr(summary.grandTotal), { big: true, divide: true })}
                {summary.alrAnnual > 0 && sumRow("ALR — annual (separate)", inr(summary.alrAnnual), { color: "var(--text3)" })}
                {sumRow("TCV", inr(summary.tcv), { bold: true })}
                {summary.recurringSubtotal > 0 && sumRow("Billing", billingFrequency, { color: "var(--text3)" })}
              </div>

              {/* Guardrail banners */}
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {needsApproval && <Banner color="#B45309" bg="#FFFBEB" icon={<AlertTriangle size={14} />} text={`Approval required — ${[...discGuard.reasons, ...marginGuard.reasons].join("; ")}`} />}
                {!ccsRule.ok && <Banner color="#B91C1C" bg="#FEF2F2" icon={<AlertTriangle size={14} />} text={ccsRule.error} />}
                {ccsRule.ok && usesBothCcs && <Banner color="#B45309" bg="#FFFBEB" icon={<Info size={14} />} text="Quote uses both CC03 and CC04 — confirm CC03 is priced above CC04." />}
                {whRule.warning && <Banner color="#B45309" bg="#FFFBEB" icon={<AlertTriangle size={14} />} text={whRule.warning} />}
                {missingRateLines.length > 0 && <Banner color="#B91C1C" bg="#FEF2F2" icon={<AlertTriangle size={14} />} text={`${missingRateLines.length} line(s) have no rate — enter the rate in the master before saving.`} />}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-sec" style={{ flex: "0 0 auto" }} disabled={!pricedLines.some(l => !l._empty)} onClick={previewPrint} title="Preview the client-facing document">Preview</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={!canSave} onClick={save}>
                  {needsApproval ? "Save (route for approval)" : "Save quote"}
                </button>
              </div>
              {!canSave && <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 6, textAlign: "center" }}>Pick an opportunity, a party, at least one priced line (no missing rates).</div>}
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

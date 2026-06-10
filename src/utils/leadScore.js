// ─────────────────────────────────────────────────────────────────────────────
// LEAD SCORING — derive a 0–100 lead Score from the 📊 sizing inputs
// ─────────────────────────────────────────────────────────────────────────────
// Per the LOB Field Dictionary, fields flagged Sizing/Score should drive the
// lead Score: organisation scale (users, staff, branches), volumes, budget,
// timeline, satisfaction (inverse) and the product-specific scale fields.
//
// This is a transparent heuristic (base + bounded contributions, capped 0–100).
// It is OFFERED via an "Auto-score" button — it never silently overwrites a
// score the user set manually.
// ─────────────────────────────────────────────────────────────────────────────

import { fieldsForProducts, LEAD_PRODUCT_FIELDS_DEFAULT } from "../data/leadFieldDict";
import { PROD_MAP } from "../data/constants";

// Magnitude bucket for any count/volume number — log-ish so huge numbers
// don't dominate. Max 10 points per field.
function magPoints(n) {
  n = Number(n) || 0;
  if (n <= 0) return 0;
  if (n < 10) return 2;
  if (n < 50) return 4;
  if (n < 200) return 6;
  if (n < 1000) return 8;
  return 10;
}

const BUDGET_PTS = { "< ₹50K": 2, "₹50K–1L": 6, "₹1L–3L": 12, "₹3L–5L": 16, "> ₹5L": 20, "ROI-based discussion": 10 };
const TIMELINE_PTS = { "< 3 months": 15, "3–6 months": 8, "6+ months": 2 };
const STAFF_PTS = { "1–10": 2, "11–25": 4, "26–50": 6, "51–100": 8, "100+": 10 };
const SAT_INV = { 1: 10, 2: 8, 3: 5, 4: 2, 5: 0 }; // lower satisfaction = stronger switch trigger
const TENDERVAL_PTS = { "Not disclosed": 4, "<₹25L": 4, "₹25L–1Cr": 8, "₹1–5Cr": 12, ">₹5Cr": 16 };

export function computeLeadScore(lead, dict) {
  if (!lead) return 50;
  const D = dict && Object.keys(dict).length ? dict : LEAD_PRODUCT_FIELDS_DEFAULT;
  let s = 30; // base

  // ── Budget / decision signals ──
  s += BUDGET_PTS[lead.budgetRange] || 0;
  s += TIMELINE_PTS[lead.decisionTimeline] || 0;
  s += STAFF_PTS[lead.staffSize] || 0;
  s += SAT_INV[Number(lead.swSatisfaction)] || 0;

  // ── Organisation scale ──
  s += Math.min(magPoints(lead.noOfUsers), 8);
  s += Math.min(magPoints(lead.branches), 4);

  // ── Volume contribution (common monthly volumes + product sizing fields),
  //    capped so big numbers can't blow past 100. ──
  const mv = lead.monthlyVolume || {};
  let volPts = magPoints(mv.airExp) + magPoints(mv.airImp) + magPoints(mv.seaTEU) + magPoints(mv.customsEntries);

  const productKeys = [
    ...((lead.productSelection || []).map(e => e.productId)),
    lead.product,
    ...((lead.additionalProducts) || []),
  ].filter(Boolean);
  const matched = fieldsForProducts(D, productKeys, PROD_MAP);
  let prodPts = 0;
  matched.forEach(entry => {
    const vals = (lead.productFields || {})[entry.key] || {};
    (entry.fields || []).filter(f => f.sizing).forEach(f => {
      const v = vals[f.key];
      if (v === undefined || v === "" || v === null) return;
      if (f.type === "number") prodPts += magPoints(v);
      else if (f.key === "tenderValue") prodPts += TENDERVAL_PTS[v] || 0;
      else prodPts += 3; // a populated sizing dropdown/other = small signal
    });
  });
  s += Math.min(volPts + prodPts, 30);

  return Math.max(0, Math.min(100, Math.round(s)));
}

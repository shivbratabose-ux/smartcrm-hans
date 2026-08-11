// ═══════════════════════════════════════════════════════════════════
// test-abp-rollup.mjs — verifies the ABP/AOP rollup in
// src/components/Targets.jsx (the byManager useMemo).
// ───────────────────────────────────────────────────────────────────
// Models the Hans structure: Line Managers report to the VP Sales, the
// ABP is cut across them by vertical/product, company-level objectives
// sit with the VP, and every team cross-sells outside its own line.
//
// Targets.jsx is JSX and can't be imported from node, so — same
// convention as the other scripts/test-*.mjs — the algorithm is
// mirrored here. KEEP IN SYNC with byManager.
// ═══════════════════════════════════════════════════════════════════

import { buildSalesGraph, allocationFor, ABP_OWNER_ROLES as REAL_ROLES } from "../src/utils/salesOrg.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// ── Mirrors of Targets.jsx helpers ────────────────────────────────
function periodOf(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const m = d.getMonth(), y = d.getFullYear();
  return `${m >= 3 ? y : y - 1}-Q${Math.floor(((m - 3 + 12) % 12) / 3) + 1}`;
}
const isWonStage = (o) => o.stage === "Won" || o.stage === "closed_won";
const prodMatches = (tProd, arr, single) => {
  if (!tProd || tProd === "All") return true;
  if (Array.isArray(arr) && arr.includes(tProd)) return true;
  return single === tProd;
};
const ABP_OWNER_ROLES = ["vp_sales_mkt", "director", "line_mgr", "country_mgr", "bd_lead"];

// ── Mirror of byManager ───────────────────────────────────────────
function byManager(filtered, users, opps) {
  // The org graph and the allocation maths come from the REAL module, so
  // this file can only drift on the achievement partition it still mirrors.
  const G = buildSalesGraph(users);
  const byId = G.byId;
  const managers = G.managers;
  const gridIds = G.gridIds;
  const alloc = allocationFor(filtered, G);

  const { branchOf, creditOf } = G;

  const credited = {};
  filtered.forEach(t => {
    const key = creditOf(t.userId);
    const c = credited[key] || (credited[key] = { target: 0, deals: 0, people: new Set(), pairs: new Set(), products: new Set() });
    c.target += Number(t.targetValue) || 0;
    c.deals += Number(t.targetDeals) || 0;
    c.people.add(t.userId);
    c.pairs.add(`${t.period}|${t.product || "All"}`);
    if (t.product && t.product !== "All") c.products.add(t.product);
  });

  const visiblePeriods = [...new Set(filtered.map(t => t.period).filter(Boolean))];
  const ledger = (opps || []).filter(o => o?.id && isWonStage(o))
    .map(o => ({ id: o.id, owner: o.owner, per: periodOf(o.closeDate),
      products: Array.isArray(o.products) ? o.products : [], value: Number(o.value) || 0 }));
  const pairMatch = (pairs, per, products) => {
    if (!per) return false;
    for (const pair of pairs) {
      const sep = pair.indexOf("|");
      if (pair.slice(0, sep) !== per) continue;
      if (!prodMatches(pair.slice(sep + 1), products)) continue;
      return true;
    }
    return false;
  };
  const dealsFor = (pairs, owners) => ledger.filter(d =>
    (!owners || owners.has(d.owner)) && pairMatch(pairs, d.per, d.products));
  const sum = (ds) => +ds.reduce((acc, d) => acc + d.value, 0).toFixed(2);
  const teamPairs = new Set(visiblePeriods.map(p2 => `${p2}|All`));

  const rows = managers.map(m => {
    const isTop = G.tops.has(m.id);
    const branchIds = branchOf(m.id);
    const a = alloc[m.id] || { teamTarget: 0, allocated: 0, individual: 0 };
    let pairs;
    if (isTop) {
      pairs = new Set();
      Object.entries(credited).forEach(([ownerId, c2]) => {
        if (ownerId === "__none" || !branchIds.has(ownerId)) return;
        c2.pairs.forEach(pr => pairs.add(pr));
      });
    } else {
      pairs = credited[m.id] ? credited[m.id].pairs : new Set();
    }
    const abpTarget = a.teamTarget;
    const consolidated = isTop;
    const c = credited[m.id];
    // Team achievement is branch-scoped unless the owner holds a real
    // product boundary — mirrors Targets.jsx.
    const productPairs = new Set([...pairs].filter(pr => !pr.endsWith("|All")));
    const branchDeals = pairs.size ? dealsFor(pairs, branchIds) : [];
    const crossInDeals = productPairs.size
      ? dealsFor(productPairs, null).filter(d => !branchIds.has(d.owner)) : [];
    const abpDeals = [...branchDeals, ...crossInDeals];
    const ownDeals = branchDeals.filter(d => d.owner === m.id);
    const teamDeals = branchDeals.filter(d => d.owner !== m.id);
    const soldDeals = dealsFor(teamPairs, branchIds);
    const soldIds = new Set(abpDeals.map(d => d.id));
    const crossOutDeals = soldDeals.filter(d => !soldIds.has(d.id));
    const achieved = sum(abpDeals);
    return {
      mgrId: m.id, role: m.role || "", consolidated,
      teamTarget: a.teamTarget, allocated: a.allocated, individual: a.individual,
      products: c ? [...c.products] : [],
      companyWide: [...pairs].some(pr => pr.endsWith("|All")),
      headcount: G.sellingCount(m.id),
      target: abpTarget, achieved,
      own: sum(ownDeals), team: sum(teamDeals), crossIn: sum(crossInDeals),
      crossOut: sum(crossOutDeals),
      wonDeals: abpDeals.length, deals: c ? c.deals : 0,
      teamSold: sum(soldDeals),
      pct: abpTarget > 0 ? Math.round((achieved / abpTarget) * 100) : null,
    };
  });

  const o = credited["__none"];
  if (o && o.target > 0) {
    const abpDeals = dealsFor(o.pairs, null);
    rows.push({ mgrId: "__none", role: "", products: [], companyWide: false, headcount: o.people.size,
      target: o.target, achieved: sum(abpDeals), own: 0, team: 0, crossIn: sum(abpDeals), crossOut: 0,
      wonDeals: abpDeals.length, deals: o.deals, teamSold: 0,
      pct: o.target > 0 ? Math.round((sum(abpDeals) / o.target) * 100) : null });
  }
  return rows.sort((a, b) => b.target - a.target || b.teamSold - a.teamSold);
}

// ── The Hans org shape ────────────────────────────────────────────
//   Parvinder (md) → Shivbrata (VP Sales) → Amit / Lotak / Ritesh (LMs)
//   Amit → Adarsh (exec) · Lotak → Neha (exec) · Ritesh → nobody yet
const USERS = [
  { id: "u_parv",  name: "Parvinder Singh",  role: "md" },
  { id: "u_shiv",  name: "Shivbrata Bose",   role: "vp_sales_mkt", reportsTo: "u_parv" },
  { id: "u_amit",  name: "Amit Mopari",      role: "line_mgr",     reportsTo: "u_shiv" },
  { id: "u_lotak", name: "Lotak Mohapatra",  role: "line_mgr",     reportsTo: "u_shiv" },
  { id: "u_rit",   name: "Ritesh Kumar",     role: "line_mgr",     reportsTo: "u_shiv" }, // no team yet
  { id: "u_adarsh",name: "Adarsh Raj",       role: "bd_lead",      reportsTo: "u_amit" }, // sales-lead ROLE but reports into a Line Manager
  { id: "u_neha",  name: "Neha S",           role: "sales_exec",   reportsTo: "u_lotak" },
  { id: "u_fin",   name: "Finance Person",   role: "finance",      reportsTo: "u_parv" },
  { id: "u_raj",   name: "Rajesh Kumar",     role: "product_head", reportsTo: "u_shiv" }, // non-sales manager under the VP
  { id: "u_sud",   name: "Sudhir",           role: "sales_exec",   reportsTo: "u_raj" },  // seller under a non-sales manager
  { id: "u_yog",   name: "Yogesh",           role: "support",      reportsTo: "u_amit" }, // support inside a sales team
];
const Q = "2026-Q2";
const CLOSE = "2026-08-15";                    // inside 2026-Q2 (India FY, Apr–Mar)

const row = (rows, id) => rows.find(r => r.mgrId === id);

console.log("\nABP / AOP rollup\n");

check("period mapping: 15 Aug 2026 → 2026-Q2", periodOf(CLOSE), Q);

// ── 1. Ritesh: a Line Manager with no team and no target still gets a row ──
{
  const targets = [{ userId: "u_adarsh", period: Q, product: "iCAFFE", targetValue: 50, targetDeals: 5 }];
  const rows = byManager(targets, USERS, []);
  check("every ABP owner is listed, team or not", rows.map(r => r.mgrId).sort(),
    ["u_amit", "u_lotak", "u_rit", "u_shiv"]);
  check("Ritesh appears despite zero reports", !!row(rows, "u_rit"), true);
  check("Ritesh reads 'no target' rather than 0%", row(rows, "u_rit").pct, null);
  check("non-sales roles get no row (MD, Finance)",
    rows.some(r => r.mgrId === "u_parv" || r.mgrId === "u_fin"), false);
  // Adarsh holds a sales-leadership ROLE (bd_lead) but reports into a Line
  // Manager, so he is a team member and not a plan owner. He was appearing as
  // an all-zero noise row because his targets already credit up to Amit.
  check("someone reporting INTO a Line Manager gets no row",
    rows.some(r => r.mgrId === "u_adarsh"), false);
}

// ── 2. Exec targets roll up into their Line Manager's commitment ──
{
  const targets = [
    { userId: "u_adarsh", period: Q, product: "iCAFFE",   targetValue: 50, targetDeals: 5 },
    { userId: "u_neha",   period: Q, product: "WiseCargo", targetValue: 30, targetDeals: 3 },
    { userId: "u_shiv",   period: Q, product: "All",       targetValue: 100, targetDeals: 10 },
  ];
  const rows = byManager(targets, USERS, []);
  check("Adarsh's ₹50L credits to Amit as his team target", row(rows, "u_amit").teamTarget, 50);
  check("Neha's ₹30L credits to Lotak as his team target", row(rows, "u_lotak").teamTarget, 30);
  // Allocation model: the VP's team target is what was ASSIGNED to them
  // (100); the Line Managers' team targets are carved OUT of it, so the VP's
  // own individual number is the 20 left over. Nothing is summed twice.
  check("VP team target = the 100 assigned to them", row(rows, "u_shiv").teamTarget, 100);
  check("VP allocated = Amit 50 + Lotak 30", row(rows, "u_shiv").allocated, 80);
  check("VP individual = the unallocated 20", row(rows, "u_shiv").individual, 20);
  check("rule 7 at the top: allocated + individual = team target",
    +(row(rows, "u_shiv").allocated + row(rows, "u_shiv").individual).toFixed(2),
    row(rows, "u_shiv").teamTarget);
  check("VP row is flagged as the top of the sales line", row(rows, "u_shiv").consolidated, true);
  check("Amit's owned vertical is iCAFFE", row(rows, "u_amit").products, ["iCAFFE"]);
  check("VP's row is flagged company-wide", row(rows, "u_shiv").companyWide, true);
  // Selling capacity only: Sudhir (seller under the Product Head) counts,
  // Rajesh (product_head) and Yogesh (support) do not.
  check("VP team = quota-carrying branch only", row(rows, "u_shiv").headcount, 6);
  check("support engineer doesn't inflate Amit's team", row(rows, "u_amit").headcount, 1);
}

// ── 3. Cross-sell: Amit's exec sells WiseCargo, which Lotak owns ──
{
  const targets = [
    { userId: "u_adarsh", period: Q, product: "iCAFFE",    targetValue: 50, targetDeals: 5 },
    { userId: "u_neha",   period: Q, product: "WiseCargo", targetValue: 30, targetDeals: 3 },
  ];
  const opps = [
    { id: "od1", owner: "u_adarsh", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"],    value: 20 },
    { id: "od2", owner: "u_adarsh", stage: "Won", closeDate: CLOSE, products: ["WiseCargo"], value: 12 }, // cross-sold
    { id: "od3", owner: "u_neha",   stage: "Won", closeDate: CLOSE, products: ["WiseCargo"], value: 8 },
  ];
  const rows = byManager(targets, USERS, opps);
  const amit = row(rows, "u_amit"), lotak = row(rows, "u_lotak");

  // Accountability follows the PRODUCT, whoever sold it.
  check("Amit's ABP achieved = iCAFFE only", amit.achieved, 20);
  check("Lotak's ABP achieved = all WiseCargo, incl. Amit's cross-sell", lotak.achieved, 20);
  // Contribution follows the SELLER.
  check("Amit's team sold = everything his people closed", amit.teamSold, 32);
  check("Neha's sales sit in Lotak's team sold", lotak.teamSold, 8);
  // The partition: own + team + crossIn = achieved, nothing counted twice.
  check("Lotak's partition sums to his achieved", +(lotak.own + lotak.team + lotak.crossIn).toFixed(2), lotak.achieved);
  check("Amit's cross-sale lands in Lotak's cross-IN", lotak.crossIn, 12);
  check("…and in Amit's cross-OUT", amit.crossOut, 12);
  check("Amit's own line revenue is team, not cross", +(amit.own + amit.team).toFixed(2), 20);
  check("cross-sell balances across the org (Σin = Σout)",
    +(amit.crossIn + lotak.crossIn).toFixed(2), +(amit.crossOut + lotak.crossOut).toFixed(2));
}

// ── 4. A deal matching several commitments is counted once ──
{
  const targets = [
    { userId: "u_shiv", period: Q, product: "All",    targetValue: 100, targetDeals: 10 },
    { userId: "u_shiv", period: Q, product: "iCAFFE", targetValue: 40,  targetDeals: 4 },
  ];
  const opps = [{ id: "od4", owner: "u_adarsh", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"], value: 25 }];
  const rows = byManager(targets, USERS, opps);
  check("an iCAFFE deal matching both 'All' and 'iCAFFE' counts once", row(rows, "u_shiv").achieved, 25);
  check("…and is one deal, not two", row(rows, "u_shiv").wonDeals, 1);
}

// ── 5. Only won deals, only dated deals, only in-period ──
{
  const targets = [{ userId: "u_adarsh", period: Q, product: "iCAFFE", targetValue: 50, targetDeals: 5 }];
  const opps = [
    { id: "od5", owner: "u_adarsh", stage: "Won",         closeDate: CLOSE,        products: ["iCAFFE"], value: 10 },
    { id: "od6", owner: "u_adarsh", stage: "Negotiation", closeDate: CLOSE,        products: ["iCAFFE"], value: 99 },
    { id: "od7", owner: "u_adarsh", stage: "Won",         closeDate: "",           products: ["iCAFFE"], value: 99 },
    { id: "od8", owner: "u_adarsh", stage: "Won",         closeDate: "2026-05-15", products: ["iCAFFE"], value: 99 }, // Q1
    { id: "od9", owner: "u_adarsh", stage: "closed_won",  closeDate: CLOSE,        products: ["iCAFFE"], value: 5 },
  ];
  const rows = byManager(targets, USERS, opps);
  check("open, undated and out-of-period deals excluded; closed_won counts",
    row(rows, "u_amit").achieved, 15);
}

// ── 6. A target owned outside the sales roles stays visible ──
{
  const targets = [
    { userId: "u_adarsh", period: Q, product: "iCAFFE", targetValue: 50, targetDeals: 5 },
    { userId: "u_fin",    period: Q, product: "All",    targetValue: 10, targetDeals: 1 },
  ];
  const rows = byManager(targets, USERS, []);
  check("orphan target surfaces in the catch-all row", row(rows, "__none").target, 10);
  // With no target explicitly assigned to the VP the plan is IMPLIED from the
  // sales branch (Amit's 50). The point of the assertion is that the finance
  // person's 10 is NOT part of it — it stays in the catch-all row.
  check("an outside-sales target never inflates the plan", row(rows, "u_shiv").teamTarget, 50);
  check("…and the orphan 10 sits outside it", row(rows, "__none").target, 10);
}

// ── 7. A reporting cycle must not hang the credit walk ──
{
  const cyclic = [
    { id: "a", name: "A", role: "line_mgr",   reportsTo: "b" },
    { id: "b", name: "B", role: "line_mgr",   reportsTo: "a" },
    { id: "c", name: "C", role: "sales_exec", reportsTo: "a" },
  ];
  const rows = byManager([{ userId: "c", period: Q, product: "iCAFFE", targetValue: 10, targetDeals: 1 }], cyclic, []);
  check("cyclic reportsTo terminates and still credits", rows.reduce((s, r) => s + r.target, 0), 10);
}

// ── 7b. A seller under a NON-sales manager credits to the VP ──
// Sudhir reports to Rajesh (product_head, outside the sales grid); the walk
// skips Rajesh and lands Sudhir's commitment on the VP row.
{
  const targets = [{ userId: "u_sud", period: Q, product: "iCAFFE", targetValue: 10, targetDeals: 1 }];
  const rows = byManager(targets, USERS, []);
  check("Sudhir's target credits to the VP, skipping the Product Head", row(rows, "u_shiv").target, 10);
  check("nothing falls into the outside-sales bucket", rows.some(r => r.mgrId === "__none"), false);
}

// ── 8. The live-data regression (numbers from production, 9 Aug 2026) ──
// Shivbrata holds 33.5+29+40+35 = 137.5 personally, Lotak 26.8+22.3 = 49.1,
// Adarsh (under Amit) 22.5+19.5+18+15 = 75. Before the creditOf fix Lotak
// read ₹0 (his targets bubbled to the VP) and the VP read 186.6 with Amit's
// 75 beside it. Now: Lotak keeps 49.1, Amit 75, and the VP consolidates
// 137.5 + 49.1 + 75 = 261.6 — the company ABP, each target counted once.
{
  const targets = [
    { userId: "u_shiv",  period: "2026-Q4", product: "All", targetValue: 33.5, targetDeals: 0 },
    { userId: "u_shiv",  period: "2026-Q3", product: "All", targetValue: 29,   targetDeals: 0 },
    { userId: "u_shiv",  period: "2026-Q1", product: "All", targetValue: 40,   targetDeals: 6 },
    { userId: "u_shiv",  period: "2025-Q4", product: "All", targetValue: 35,   targetDeals: 5 },
    { userId: "u_lotak", period: "2026-Q2", product: "All", targetValue: 26.8, targetDeals: 0 },
    { userId: "u_lotak", period: "2026-Q1", product: "All", targetValue: 22.3, targetDeals: 0 },
    { userId: "u_adarsh", period: "2026-Q3", product: "All", targetValue: 22.5, targetDeals: 30 },
    { userId: "u_adarsh", period: "2026-Q3", product: "All", targetValue: 19.5, targetDeals: 30 },
    { userId: "u_adarsh", period: "2026-Q2", product: "All", targetValue: 18,   targetDeals: 30 },
    { userId: "u_adarsh", period: "2026-Q1", product: "All", targetValue: 15,   targetDeals: 30 },
  ];
  const rows = byManager(targets, USERS, []);
  check("live shape: Lotak keeps his own ₹49.1L (was ₹0)", row(rows, "u_lotak").teamTarget, 49.1);
  check("live shape: Amit carries Adarsh's ₹75L", row(rows, "u_amit").teamTarget, 75);
  // Under the allocation model the VP's ₹137.5L is the plan ASSIGNED to them,
  // and Lotak's ₹49.1L + Amit's ₹75L are carved out of it — which leaves the
  // VP over-allocated by ₹13.4L on this data, surfaced rather than hidden.
  check("live shape: VP team target = the ₹137.5L assigned", row(rows, "u_shiv").teamTarget, 137.5);
  check("live shape: VP allocated = Lotak 49.1 + Amit 75", row(rows, "u_shiv").allocated, 124.1);
  check("live shape: VP individual = ₹13.4L left unallocated", row(rows, "u_shiv").individual, 13.4);
  check("live shape: VP row is the top of the sales line", row(rows, "u_shiv").consolidated, true);
}

// ── 9. Company-wide targets must not give every manager every deal ──
// The reported bug: two Line Managers with different teams both showed the
// SAME "team achieved" figure, because an "All Products" commitment matches
// every deal in the company. Each must see only their own branch's closes.
{
  const targets = [
    { userId: "u_amit",  period: Q, product: "All", targetValue: 50, targetDeals: 5 },
    { userId: "u_lotak", period: Q, product: "All", targetValue: 40, targetDeals: 4 },
  ];
  const opps = [
    { id: "x1", owner: "u_adarsh", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"],    value: 30 },
    { id: "x2", owner: "u_neha",   stage: "Won", closeDate: CLOSE, products: ["WiseCargo"], value: 12 },
  ];
  const rows = byManager(targets, USERS, opps);
  const amit = row(rows, "u_amit"), lotak = row(rows, "u_lotak");
  check("Amit sees only his branch's closes", amit.achieved, 30);
  check("Lotak sees only his branch's closes", lotak.achieved, 12);
  check("two managers no longer report the SAME figure", amit.achieved !== lotak.achieved, true);
  check("company-wide commitments generate no phantom cross-in",
    [amit.crossIn, lotak.crossIn], [0, 0]);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

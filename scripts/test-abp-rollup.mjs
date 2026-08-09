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
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const isSalesLead = (u) => ABP_OWNER_ROLES.includes(String(u?.role || "").trim().toLowerCase());
  const leads = users.filter(u => u.active !== false).filter(isSalesLead);
  const tops = new Set(leads.filter(u => !isSalesLead(byId[u.reportsTo])).map(u => u.id));
  const managers = leads
    .filter(u => tops.has(u.id) || tops.has(u.reportsTo))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const gridIds = new Set(managers.map(m => m.id));

  const childrenOf = {};
  users.forEach(u => {
    [u.reportsTo, ...(Array.isArray(u.dottedTo) ? u.dottedTo : [])]
      .filter(Boolean)
      .forEach(pid => (childrenOf[pid] || (childrenOf[pid] = [])).push(u.id));
  });
  const branchOf = (rootId) => {
    const out = new Set([rootId]); const stack = [rootId];
    while (stack.length) {
      for (const c of childrenOf[stack.pop()] || []) if (!out.has(c)) { out.add(c); stack.push(c); }
    }
    return out;
  };

  const creditOf = (uid) => {
    let cur = byId[uid]; const seen = new Set();
    while (cur && cur.reportsTo && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (gridIds.has(cur.reportsTo)) return cur.reportsTo;
      cur = byId[cur.reportsTo];
    }
    return gridIds.has(uid) ? uid : "__none";
  };

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
  const revenueFor = (pairs, owners) => {
    let value = 0, deals = 0;
    (opps || []).forEach(o => {
      if (!isWonStage(o)) return;
      if (owners && !owners.has(o.owner)) return;
      const per = periodOf(o.closeDate);
      if (!per) return;
      for (const pair of pairs) {
        const sep = pair.indexOf("|");
        if (pair.slice(0, sep) !== per) continue;
        if (!prodMatches(pair.slice(sep + 1), o.products)) continue;
        value += Number(o.value) || 0; deals += 1;
        return;
      }
    });
    return { value: +value.toFixed(2), deals };
  };
  const teamPairs = new Set(visiblePeriods.map(p => `${p}|All`));

  const rows = managers.map(m => {
    const c = credited[m.id];
    const pairs = c ? c.pairs : new Set();
    const abpTarget = c ? c.target : 0;
    const abp = pairs.size ? revenueFor(pairs, null) : { value: 0, deals: 0 };
    const branchIds = branchOf(m.id);
    const team = revenueFor(teamPairs, branchIds);
    return {
      mgrId: m.id, role: m.role || "", products: c ? [...c.products] : [],
      companyWide: [...pairs].some(p => p.endsWith("|All")),
      headcount: Math.max(branchIds.size - 1, 0),
      target: abpTarget, achieved: abp.value, wonDeals: abp.deals, deals: c ? c.deals : 0,
      teamSold: team.value, delta: +(team.value - abp.value).toFixed(2),
      pct: abpTarget > 0 ? Math.round((abp.value / abpTarget) * 100) : null,
    };
  });

  const o = credited["__none"];
  if (o && o.target > 0) {
    const abp = revenueFor(o.pairs, null);
    rows.push({ mgrId: "__none", role: "", products: [], companyWide: false, headcount: o.people.size,
      target: o.target, achieved: abp.value, wonDeals: abp.deals, deals: o.deals, teamSold: 0, delta: 0,
      pct: o.target > 0 ? Math.round((abp.value / o.target) * 100) : null });
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
  check("Adarsh's ₹50L credits to Amit", row(rows, "u_amit").target, 50);
  check("Neha's ₹30L credits to Lotak", row(rows, "u_lotak").target, 30);
  check("VP keeps the company-level ₹100L", row(rows, "u_shiv").target, 100);
  check("ABP Target reconciles with the page total",
    rows.reduce((s, r) => s + r.target, 0), 180);
  check("Amit's owned vertical is iCAFFE", row(rows, "u_amit").products, ["iCAFFE"]);
  check("VP's row is flagged company-wide", row(rows, "u_shiv").companyWide, true);
  check("headcount is the real branch, not visibility scope", row(rows, "u_shiv").headcount, 5);
}

// ── 3. Cross-sell: Amit's exec sells WiseCargo, which Lotak owns ──
{
  const targets = [
    { userId: "u_adarsh", period: Q, product: "iCAFFE",    targetValue: 50, targetDeals: 5 },
    { userId: "u_neha",   period: Q, product: "WiseCargo", targetValue: 30, targetDeals: 3 },
  ];
  const opps = [
    { owner: "u_adarsh", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"],    value: 20 },
    { owner: "u_adarsh", stage: "Won", closeDate: CLOSE, products: ["WiseCargo"], value: 12 }, // cross-sold
    { owner: "u_neha",   stage: "Won", closeDate: CLOSE, products: ["WiseCargo"], value: 8 },
  ];
  const rows = byManager(targets, USERS, opps);
  const amit = row(rows, "u_amit"), lotak = row(rows, "u_lotak");

  // Accountability follows the PRODUCT, whoever sold it.
  check("Amit's ABP achieved = iCAFFE only", amit.achieved, 20);
  check("Lotak's ABP achieved = all WiseCargo, incl. Amit's cross-sell", lotak.achieved, 20);
  // Contribution follows the SELLER.
  check("Amit's team sold = everything his people closed", amit.teamSold, 32);
  check("Neha's sales sit in Lotak's team sold", lotak.teamSold, 8);
  // The gap between the two IS the cross-sell.
  check("Amit's Δ is positive — he sold into another line", amit.delta, 12);
  check("Lotak's Δ is negative — another line sold into his", lotak.delta, -12);
  check("cross-sell nets to zero across the org", +(amit.delta + lotak.delta).toFixed(2), 0);
}

// ── 4. A deal matching several commitments is counted once ──
{
  const targets = [
    { userId: "u_shiv", period: Q, product: "All",    targetValue: 100, targetDeals: 10 },
    { userId: "u_shiv", period: Q, product: "iCAFFE", targetValue: 40,  targetDeals: 4 },
  ];
  const opps = [{ owner: "u_adarsh", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"], value: 25 }];
  const rows = byManager(targets, USERS, opps);
  check("an iCAFFE deal matching both 'All' and 'iCAFFE' counts once", row(rows, "u_shiv").achieved, 25);
  check("…and is one deal, not two", row(rows, "u_shiv").wonDeals, 1);
}

// ── 5. Only won deals, only dated deals, only in-period ──
{
  const targets = [{ userId: "u_adarsh", period: Q, product: "iCAFFE", targetValue: 50, targetDeals: 5 }];
  const opps = [
    { owner: "u_adarsh", stage: "Won",         closeDate: CLOSE,        products: ["iCAFFE"], value: 10 },
    { owner: "u_adarsh", stage: "Negotiation", closeDate: CLOSE,        products: ["iCAFFE"], value: 99 },
    { owner: "u_adarsh", stage: "Won",         closeDate: "",           products: ["iCAFFE"], value: 99 },
    { owner: "u_adarsh", stage: "Won",         closeDate: "2026-05-15", products: ["iCAFFE"], value: 99 }, // Q1
    { owner: "u_adarsh", stage: "closed_won",  closeDate: CLOSE,        products: ["iCAFFE"], value: 5 },
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
  check("ABP Target still reconciles with the page total",
    rows.reduce((s, r) => s + r.target, 0), 60);
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

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

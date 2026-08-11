// ═══════════════════════════════════════════════════════════════════
// test-target-allocation.mjs — the parent/child target model.
// ───────────────────────────────────────────────────────────────────
// A target assigned TO a manager is their COMPLETE TEAM TARGET. Targets
// held by their reports are carve-outs of it, never additions. The
// unallocated remainder automatically becomes that manager's own
// individual target, so at every level:
//
//     Σ member individual targets + manager individual = team target
//
// src/utils/salesOrg.js is plain ESM with no JSX, so this imports the
// REAL implementation rather than mirroring it.
// ═══════════════════════════════════════════════════════════════════

import { buildSalesGraph, allocationFor } from "../src/utils/salesOrg.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// Values in ₹ lakh, the unit the app stores. ₹1 Cr = 100 L.
const CR = 100, L = 1;
const Q = "2026-Q2";
const t = (userId, targetValue, id) => ({ id: id || `t_${userId}_${targetValue}`, userId, period: Q, product: "All", targetValue });

// VP → Line Manager A → three employees; Line Manager B for contrast.
const USERS = [
  { id: "md",   name: "MD",              role: "md" },
  { id: "vp",   name: "VP Sales",        role: "vp_sales_mkt", reportsTo: "md" },
  { id: "lmA",  name: "Line Manager A",  role: "line_mgr",     reportsTo: "vp" },
  { id: "lmB",  name: "Line Manager B",  role: "line_mgr",     reportsTo: "vp" },
  { id: "e1",   name: "Employee 1",      role: "sales_exec",   reportsTo: "lmA" },
  { id: "e2",   name: "Employee 2",      role: "sales_exec",   reportsTo: "lmA" },
  { id: "e3",   name: "Employee 3",      role: "sales_exec",   reportsTo: "lmA" },
];
const G = buildSalesGraph(USERS);

console.log("\nTarget allocation — parent/child model\n");

// ── The specified example, verbatim ───────────────────────────────
// Team target ₹1,00,00,000 to Line Manager A; members hold 20 + 25 + 15
// lakh = ₹60,00,000; the remaining ₹40,00,000 IS the manager's own target.
{
  const rows = [t("lmA", 1 * CR), t("e1", 20 * L), t("e2", 25 * L), t("e3", 15 * L)];
  const a = allocationFor(rows, G).lmA;
  check("Team Target = ₹1 Cr as assigned", a.teamTarget, 100);
  check("Allocated to team = ₹60 L", a.allocated, 60);
  check("Manager Individual = ₹40 L (auto)", a.individual, 40);
  check("rule 7: members + manager individual = team target",
    +(a.allocated + a.individual).toFixed(2), a.teamTarget);
  check("rule 1: the team target is NOT the sum of parent + children",
    a.teamTarget !== rows.reduce((s, r) => s + r.targetValue, 0), true);
}

// ── Rule 5: give a member more, the manager's own number falls ─────
{
  const before = allocationFor([t("lmA", 1 * CR), t("e1", 20 * L), t("e2", 25 * L), t("e3", 15 * L)], G).lmA;
  const after  = allocationFor([t("lmA", 1 * CR), t("e1", 30 * L), t("e2", 25 * L), t("e3", 15 * L)], G).lmA;
  check("rule 5: +₹10 L to Employee 1 → manager individual ₹40 L → ₹30 L",
    [before.individual, after.individual], [40, 30]);
  check("rule 5: the team target itself never moves", after.teamTarget, 100);
}

// ── Rule 6: reduce or remove a member, the manager's number rises ──
{
  const reduced = allocationFor([t("lmA", 1 * CR), t("e1", 10 * L), t("e2", 25 * L), t("e3", 15 * L)], G).lmA;
  const removed = allocationFor([t("lmA", 1 * CR), t("e2", 25 * L), t("e3", 15 * L)], G).lmA;
  check("rule 6: Employee 1 cut to ₹10 L → manager individual ₹50 L", reduced.individual, 50);
  check("rule 6: Employee 1 removed entirely → manager individual ₹60 L", removed.individual, 60);
  check("rule 7 still holds after removal",
    +(removed.allocated + removed.individual).toFixed(2), removed.teamTarget);
}

// ── Rule 9: the same rule recurses upward to the VP ────────────────
// VP team target ₹3 Cr; LM A holds ₹1 Cr, LM B ₹80 L → VP's own
// individual target is the ₹1.2 Cr not given to either manager.
{
  const rows = [
    t("vp", 3 * CR),
    t("lmA", 1 * CR), t("e1", 20 * L), t("e2", 25 * L), t("e3", 15 * L),
    t("lmB", 80 * L),
  ];
  const a = allocationFor(rows, G);
  check("VP team target = ₹3 Cr as assigned", a.vp.teamTarget, 300);
  check("VP allocated = LM A ₹1 Cr + LM B ₹80 L", a.vp.allocated, 180);
  check("VP individual = ₹1.2 Cr", a.vp.individual, 120);
  check("the VP consumes MANAGER team targets, not their members' rows",
    a.vp.allocated, a.lmA.teamTarget + a.lmB.teamTarget);
  check("Line Manager A is unaffected by the level above", a.lmA.individual, 40);
  check("rule 7 at the top level",
    +(a.vp.allocated + a.vp.individual).toFixed(2), a.vp.teamTarget);
}

// ── Rule 8 signal: over-allocation is flagged, not silently absorbed ──
{
  const a = allocationFor([t("lmA", 50 * L), t("e1", 30 * L), t("e2", 30 * L)], G).lmA;
  check("over-allocation flagged", a.overAllocated, true);
  check("over-allocation shows a NEGATIVE manager individual, never clamped", a.individual, -10);
  check("the assigned team target is still reported honestly", a.teamTarget, 50);
}

// ── Legacy data: members allocated but no team target assigned ──────
{
  const a = allocationFor([t("e1", 20 * L), t("e2", 25 * L)], G).lmA;
  check("no team target → implied from allocations", a.teamTarget, 45);
  check("no team target → flagged as implied", a.noTeamTarget, true);
  check("no team target → manager individual is zero, not negative", a.individual, 0);
}

// ── A manager with a target and no team keeps all of it ────────────
{
  const a = allocationFor([t("lmB", 40 * L)], G).lmB;
  check("no team → the whole team target is the manager's own", a.individual, 40);
  check("no team → nothing allocated", a.allocated, 0);
}

// ── No double counting anywhere in the hierarchy ───────────────────
{
  const rows = [
    t("vp", 3 * CR),
    t("lmA", 1 * CR), t("e1", 20 * L), t("e2", 25 * L), t("e3", 15 * L),
    t("lmB", 80 * L),
  ];
  const a = allocationFor(rows, G);
  // Every rupee of the company plan is held exactly once: the VP's own
  // individual share plus each manager's individual share plus every
  // member's row.
  const individuals = a.vp.individual + a.lmA.individual + a.lmB.individual;
  const members = 20 + 25 + 15;
  check("company plan = Σ individual targets + Σ member targets, once each",
    +(individuals + members).toFixed(2), a.vp.teamTarget);
  check("naive summing of every row would have inflated the plan",
    rows.reduce((s, r) => s + r.targetValue, 0), 540);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

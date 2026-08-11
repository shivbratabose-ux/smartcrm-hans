// ═══════════════════════════════════════════════════════════════════
// The sales org graph — one definition of "who is a plan owner", "whose
// branch is whose", and "where does a person's number credit", shared by
// the Targets (ABP) dashboard and My Performance so the two can never
// disagree about the hierarchy. Mirrored in scripts/test-abp-rollup.mjs —
// KEEP IN SYNC.
// ═══════════════════════════════════════════════════════════════════

// Roles that can OWN a slice of the ABP/AOP. Roles above the sales line
// (MD, Admin) and outside it (Finance, Product Head, Support…) stay out.
export const ABP_OWNER_ROLES = ["vp_sales_mkt", "director", "line_mgr", "country_mgr", "bd_lead"];
// Roles that carry quota — the "selling headcount".
export const SELLING_ROLES = new Set([...ABP_OWNER_ROLES, "sales_exec"]);

const roleOf = (u) => String(u?.role || "").trim().toLowerCase();

// Build the whole graph once from the users list.
export function buildSalesGraph(orgUsers) {
  const users = (orgUsers || []).filter(u => u && u.id);
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const active = users.filter(u => u.active !== false);
  const isSalesLead = (u) => ABP_OWNER_ROLES.includes(roleOf(u));

  // Top of the sales line: a sales-leadership person with no sales-leadership
  // manager above them — the VP Sales, whose own manager is the MD. Computed
  // rather than hardcoded so a title change doesn't empty the panel.
  const leads = active.filter(isSalesLead);
  const tops = new Set(leads.filter(u => !isSalesLead(byId[u.reportsTo])).map(u => u.id));

  // The plan tier: the top plus the layer directly beneath it. Reporting
  // INTO a Line Manager disqualifies you whatever your role title says.
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

  // True reporting branch (self + every report at any depth, solid or dotted).
  // NOT getScopedUserIds — that is a VISIBILITY scope and short-circuits to
  // the whole org for global roles.
  const branchOf = (rootId) => {
    const out = new Set([rootId]);
    const stack = [rootId];
    while (stack.length) {
      for (const child of childrenOf[stack.pop()] || []) {
        if (!out.has(child)) { out.add(child); stack.push(child); }
      }
    }
    return out;
  };

  // Accountable plan owner for a user's numbers: themselves if in the grid,
  // else the nearest grid member above (skipping non-sales managers — this
  // routes a seller under the Product Head onto the VP).
  const creditOf = (uid) => {
    if (gridIds.has(uid)) return uid;
    let cur = byId[uid];
    const seen = new Set();
    while (cur && cur.reportsTo && !seen.has(cur.id)) {
      seen.add(cur.id);                       // cycle guard
      if (gridIds.has(cur.reportsTo)) return cur.reportsTo;
      cur = byId[cur.reportsTo];
    }
    return "__none";
  };

  // Nearest sales-line manager strictly ABOVE a user (null at the top).
  const salesManagerOf = (uid) => {
    let cur = byId[uid];
    const seen = new Set();
    while (cur && cur.reportsTo && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (gridIds.has(cur.reportsTo)) return cur.reportsTo;
      cur = byId[cur.reportsTo];
    }
    return null;
  };

  const sellingCount = (rootId) => {
    let n = 0;
    branchOf(rootId).forEach(id => { if (id !== rootId && SELLING_ROLES.has(roleOf(byId[id]))) n++; });
    return n;
  };

  return { byId, users: active, managers, tops, gridIds, childrenOf, branchOf, creditOf, salesManagerOf, sellingCount };
}

// ═══════════════════════════════════════════════════════════════════
// Target allocation — the parent/child model:
//
//   A target assigned TO a manager is their COMPLETE TEAM TARGET.
//   Targets assigned to their reports are carve-outs of it, never
//   additions. The unallocated remainder is automatically the manager's
//   own individual target, so at every level:
//
//     Σ member individual targets + manager individual target
//         = manager's team target
//
//   The same rule recurses upward: each Line Manager's team target is an
//   allocation of the VP's (company) team target, and the VP's
//   individual target is what remains after the LM allocations.
// ═══════════════════════════════════════════════════════════════════
//
// `rows` = live target rows in scope; `graph` from buildSalesGraph.
// Returns per grid-owner:
//   teamTarget    — Σ rows HELD BY the owner (the assigned parent target);
//                   when none exist but members hold rows, falls back to
//                   the allocation sum so legacy data keeps working,
//                   flagged noTeamTarget.
//   allocated     — non-top: Σ rows held by members credited to them.
//                   top: Σ child managers' team targets + direct members.
//   individual    — teamTarget − allocated (negative = over-allocated).
//   memberTotal   — raw Σ of member rows (= allocated for non-top).
export function allocationFor(rows, graph) {
  const live = (rows || []).filter(t => t && !t.isDeleted);
  const own = {}, member = {};
  live.forEach(t => {
    const v = Number(t.targetValue) || 0;
    const key = graph.creditOf(t.userId);
    if (key === "__none") return;
    if (t.userId === key) own[key] = +( (own[key] || 0) + v ).toFixed(2);
    else member[key] = +( (member[key] || 0) + v ).toFixed(2);
  });

  const out = {};
  // Non-top first, so the top can sum the children's resolved team targets.
  graph.managers.forEach(m => {
    if (graph.tops.has(m.id)) return;
    const teamAssigned = own[m.id] || 0;
    const allocated = member[m.id] || 0;
    const noTeamTarget = teamAssigned === 0 && allocated > 0;
    const teamTarget = noTeamTarget ? allocated : teamAssigned;
    out[m.id] = {
      teamTarget, allocated, memberTotal: allocated,
      individual: +(teamTarget - allocated).toFixed(2),
      noTeamTarget,
      overAllocated: teamAssigned > 0 && allocated > teamAssigned,
    };
  });
  graph.managers.forEach(m => {
    if (!graph.tops.has(m.id)) return;
    const branch = graph.branchOf(m.id);
    const childTeam = graph.managers
      .filter(c => c.id !== m.id && branch.has(c.id))
      .reduce((s, c) => s + (out[c.id]?.teamTarget || 0), 0);
    const direct = member[m.id] || 0;               // sellers crediting straight to the top
    const allocated = +(childTeam + direct).toFixed(2);
    const teamAssigned = own[m.id] || 0;
    const noTeamTarget = teamAssigned === 0 && allocated > 0;
    const teamTarget = noTeamTarget ? allocated : teamAssigned;
    out[m.id] = {
      teamTarget, allocated, memberTotal: direct,
      individual: +(teamTarget - allocated).toFixed(2),
      noTeamTarget,
      overAllocated: teamAssigned > 0 && allocated > teamAssigned,
    };
  });
  return out;
}

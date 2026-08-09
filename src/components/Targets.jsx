import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Check, Download, Target, TrendingUp, TrendingDown, Users, Package, GitBranch, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP } from '../data/constants';
import { BLANK_TARGET } from '../data/seed';
import { fmt, uid, sanitizeObj, hasErrors, softDeleteById } from '../utils/helpers';
import { UserPill, Modal, Confirm, FormError, Empty } from './shared';
import Pagination, { usePagination } from './Pagination';
import { exportCSV } from '../utils/csv';

// Column 0 (Salesperson) is supplied by the Export button instead, which
// resolves names from LIVE users — this static TEAM_MAP left every real
// Supabase user blank. Kept as the shared tail via CSV_COLS.slice(1).
const CSV_COLS = [
  { label: "Salesperson", accessor: t => TEAM_MAP[t.userId]?.name || "" },
  { label: "Period", accessor: t => t.period },
  { label: "Product", accessor: t => t.product === "All" ? "All Products" : (PROD_MAP[t.product]?.name || t.product) },
  { label: "Target (L)", accessor: t => t.targetValue },
  { label: "Achieved (L)", accessor: t => t.achievedValue },
  { label: "Gap (L)", accessor: t => t.targetValue - t.achievedValue },
  { label: "% Achievement", accessor: t => t.targetValue > 0 ? ((t.achievedValue/t.targetValue)*100).toFixed(0) : 0 },
  { label: "Target Deals", accessor: t => t.targetDeals },
  { label: "Achieved Deals", accessor: t => t.achievedDeals },
  { label: "Target Calls", accessor: t => t.targetCalls },
  { label: "Achieved Calls", accessor: t => t.achievedCalls },
];

// Fiscal-quarter (India FY, Apr–Mar) key for a date → "YYYY-Q#", where YYYY
// is the FY start year and Q1 = Apr–Jun. Matches the app's "2026-Q1" usage.
//
// Reads the calendar fields straight out of a "YYYY-MM-DD" string rather than
// going through `new Date(...)`, which parses a bare date as UTC midnight.
// That matters more here than anywhere else in the app: this function decides
// which fiscal quarter a won deal books to, and west of UTC a deal closing on
// 1 April was pushed back into the PREVIOUS financial year's Q4. Reading the
// string is also exactly right for a DATE column, which stores a calendar day
// and not an instant.
function periodOf(dateStr) {
  if (!dateStr) return "";
  let y, mo;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (m) {
    y = Number(m[1]); mo = Number(m[2]) - 1;
  } else {
    const d = new Date(dateStr);            // full timestamp or other format
    if (isNaN(d)) return "";
    y = d.getFullYear(); mo = d.getMonth();
  }
  if (mo < 0 || mo > 11) return "";
  const fyStart = mo >= 3 ? y : y - 1;
  const q = Math.floor(((mo - 3 + 12) % 12) / 3) + 1;
  return `${fyStart}-Q${q}`;
}

// Stage names meaning "won", whatever Masters currently calls the stage.
// Pipeline stages are editable in Masters → Pipeline Stages, and Pipeline
// resolves the won stage by `kind === "won"` precisely so a rename cannot
// break forecasting. Targets compared against the literal "Won", so renaming
// the stage silently dropped every target on this page to 0% with no error.
//
// The legacy literals stay in the match set because opportunity rows keep
// whatever stage string they were saved with — renaming a stage in Masters
// does not rewrite history, so both the configured name and the old one count.
const LEGACY_WON_STAGES = ["Won", "closed_won"];
const wonStageNames = (masters) => {
  const won = Array.isArray(masters?.stages) ? masters.stages.find(s => s?.kind === "won") : null;
  return new Set([won?.name, ...LEGACY_WON_STAGES].filter(Boolean));
};
// A target's product focus matches an item with a products[] array (opps) or
// a single product + productSelection[] (call reports). "All" matches everything.
const prodMatches = (tProd, arr, single) => {
  if (!tProd || tProd === "All") return true;
  if (Array.isArray(arr) && arr.includes(tProd)) return true;
  return single === tProd;
};

// Stages meaning "closed lost" — a deal in neither won nor lost is PIPELINE.
// Resolved from Masters by kind (same rationale as wonStageNames); legacy
// literals kept for historical rows.
const lostStageNames = (masters) => {
  const lost = Array.isArray(masters?.stages) ? masters.stages.find(st => st?.kind === "lost") : null;
  return new Set([lost?.name, "Lost", "closed_lost", "Suspended"].filter(Boolean));
};

// FY of a period key: "2026-Q2" → "2026". Periods already carry the FY start
// year (India FY, Apr–Mar), so this is a string slice, not date math.
const fyOf = (period) => String(period || "").slice(0, 4);

// ── Business verticals ──────────────────────────────────────────────
// Falls back to the Hans ecosystem's known verticals when Masters carries no
// `verticals` list. Reads masters first so the set stays configurable without
// a code change once a verticals master exists.
const DEFAULT_VERTICALS = [
  "CHA / End Customer", "Freight Forwarder", "Port Management",
  "Airline / Liner", "Warehouse / Custodians", "TMS / Transportation",
];
const verticalOptions = (masters) => {
  const list = Array.isArray(masters?.verticals) ? masters.verticals : null;
  const names = list ? list.map(v => (typeof v === "string" ? v : v?.name)).filter(Boolean) : null;
  return names && names.length ? names : DEFAULT_VERTICALS;
};

// ── Contribution-source attribution ─────────────────────────────────
// Which department ORIGINATED a deal. Derived from data the CRM already
// captures — nothing is invented: an opp's campaignSource, its own source
// field (OPP_SOURCES), and the source of its linked lead(s) (LEAD_SOURCES,
// via sourceLeadIds / leadId). Unknowns land in "Direct Sales" because in
// this CRM a bare opp with no origin metadata is a rep-sourced deal.
const CONTRIB_SOURCES = ["Direct Sales", "Cross-Sell", "Marketing", "Pre-Sales", "Customer Success", "Partner / Alliance", "Operations", "Other"];
const LEAD_SOURCE_DEPT = {
  "social media": "Marketing", "events": "Marketing",
  "inside sales": "Direct Sales", "direct sales": "Direct Sales",
  "support": "Customer Success",
  "development": "Pre-Sales",
  "collection": "Operations",
  "referrals": "Other",
};
const originOf = (opp, leadById) => {
  if (opp?.campaignSource) return "Marketing";
  const src = String(opp?.source || "").toLowerCase();
  if (src === "partner") return "Partner / Alliance";
  if (src.includes("cross-sell") || opp?.upsellFlag) return "Cross-Sell";
  if (src === "referral") return "Other";
  const leadIds = [...(Array.isArray(opp?.sourceLeadIds) ? opp.sourceLeadIds : []), opp?.leadId].filter(Boolean);
  for (const lid of leadIds) {
    const lsrc = String(leadById[lid]?.source || "").toLowerCase();
    if (LEAD_SOURCE_DEPT[lsrc]) return LEAD_SOURCE_DEPT[lsrc];
  }
  return "Direct Sales";
};

function Targets({ targets, setTargets, opps = [], callReports = [], leads = [], orgUsers = [], currentUser, canDelete, masters, canWrite = true }) {
  const [periodF, setPeriodF] = useState("All");
  // Product + line-manager filters: lets leadership see "iCAFFE targets for
  // Lalchand's team" rather than one flat list.
  const [productF, setProductF] = useState("All");
  const [teamF, setTeamF] = useState("All");
  const [fyF, setFyF] = useState("All");            // financial year (from period keys)
  const [verticalF, setVerticalF] = useState("All");
  const [salesF, setSalesF] = useState("All");      // individual salesperson
  const [typeF, setTypeF] = useState("All");        // Company / Product / Individual
  const [sourceF, setSourceF] = useState("All");    // deal origin (contribution source)
  const [groupBy, setGroupBy] = useState("salesperson"); // chart grouping
  const [drill, setDrill] = useState(null);         // { title, deals } → drill-down modal
  const [goalsFor, setGoalsFor] = useState(null);   // owner id → per-owner goals editor
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_TARGET);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // Live-user helpers (fall back to the static seed when orgUsers is empty).
  const userOpts = (orgUsers && orgUsers.length ? orgUsers.filter(u => u.active !== false) : TEAM);
  const userName = (id) => (orgUsers || []).find(u => u.id === id)?.name || TEAM_MAP[id]?.name || id || "";

  // ── Line-manager alignment ──
  // managers = anyone with at least one direct report (solid reportsTo or
  // dotted line). Selecting one scopes the page to that whole branch, so a
  // manager's product targets and their team's roll up together.
  // ── Who owns a slice of the ABP/AOP ──
  // The annual plan is cut across the Line Managers by vertical/product, and
  // whatever stays company-level is owned by the VP Sales & Marketing. So the
  // panel lists every BD / line-management / sales-leadership role up to VP —
  // and does NOT require the person to have direct reports.
  //
  // That last part matters: the previous rule also demanded at least one
  // report, which silently dropped a Line Manager who owns an ABP number but
  // hasn't been assigned a team yet. They own a commitment, so they get a row
  // and it reads "no target" rather than the manager vanishing.
  //
  // Roles above the sales line (MD, Admin) and outside it (Finance, Product
  // Head, Tech Lead, Support, Viewer) stay out — their rows were noise. Add
  // "sales_exec" here if you ever want individual contributors listed too;
  // today their targets roll up into their Line Manager's row instead, and
  // the detail table below already lists them line by line.
  const ABP_OWNER_ROLES = ["vp_sales_mkt", "director", "line_mgr", "country_mgr", "bd_lead"];
  const managers = useMemo(() => {
    const all = userOpts;
    const byId = Object.fromEntries(all.map(u => [u.id, u]));
    const isSalesLead = (u) => ABP_OWNER_ROLES.includes(String(u?.role || "").trim().toLowerCase());
    const leads = all.filter(isSalesLead);

    // Top of the sales line: a sales-leadership person with no sales-leadership
    // manager above them — the VP Sales, whose own manager is the MD. Computed
    // rather than hardcoded so a title change doesn't empty the panel, and so
    // a Line Manager parked under the MD by a data slip still gets a row
    // instead of vanishing.
    const tops = new Set(leads.filter(u => !isSalesLead(byId[u.reportsTo])).map(u => u.id));

    // The plan tier is the top plus the layer directly beneath it. Anyone who
    // reports INTO a Line Manager is a team member, not a plan owner, so they
    // get no row even when their role says otherwise — their targets already
    // roll up into their manager's commitment via creditOf, so a row of their
    // own would be empty noise.
    return leads
      .filter(u => tops.has(u.id) || tops.has(u.reportsTo))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [orgUsers]);
  // ── The org graph, built once from the confirmed hierarchy ──
  // Everything hierarchy-shaped on this page reads from here, so "team",
  // "line manager" and "branch" mean the same thing in every widget.
  const orgGraph = useMemo(() => {
    const users = orgUsers || [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const gridIds = new Set(managers.map(m => m.id));
    const childrenOf = {};
    users.forEach(u => {
      [u.reportsTo, ...(Array.isArray(u.dottedTo) ? u.dottedTo : [])]
        .filter(Boolean)
        .forEach(pid => (childrenOf[pid] || (childrenOf[pid] = [])).push(u.id));
    });
    // True reporting branch (self + every report at any depth, solid or
    // dotted). Deliberately NOT getScopedUserIds — that is a VISIBILITY
    // scope and short-circuits to the entire org for global roles, which
    // once made the VP's team the whole company, Finance included.
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
    // Accountable ABP owner for a user's numbers: themselves if they are in
    // the sales grid, else the nearest grid member above them. This is what
    // routes Sudhir (sales exec under the Product Head) past Rajesh and onto
    // the VP's row — the walk skips non-sales managers.
    const creditOf = (uid2) => {
      if (gridIds.has(uid2)) return uid2;
      let cur = byId[uid2];
      const seen = new Set();
      while (cur && cur.reportsTo && !seen.has(cur.id)) {
        seen.add(cur.id);                       // cycle guard
        if (gridIds.has(cur.reportsTo)) return cur.reportsTo;
        cur = byId[cur.reportsTo];
      }
      return "__none";
    };
    // Nearest sales-line manager strictly ABOVE a user — the "Line Manager"
    // column. The direct reportsTo was wrong per the real hierarchy: it
    // showed the MD for the VP's rows and the Product Head for Sudhir's,
    // neither of whom is a sales Line Manager.
    const salesManagerOf = (uid2) => {
      let cur = byId[uid2];
      const seen = new Set();
      while (cur && cur.reportsTo && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (gridIds.has(cur.reportsTo)) return cur.reportsTo;
        cur = byId[cur.reportsTo];
      }
      return null;                              // top of the sales line, or outside it
    };
    // Selling headcount: people who carry quota. Amit's branch includes
    // three Support Engineers per the org chart — they belong to his team
    // but not to his selling capacity, so the Team column excludes them.
    const SELLING_ROLES = new Set([...ABP_OWNER_ROLES, "sales_exec"]);
    const sellingCount = (rootId) => {
      let n = 0;
      branchOf(rootId).forEach(id2 => {
        if (id2 !== rootId && SELLING_ROLES.has(String(byId[id2]?.role || "").trim().toLowerCase())) n++;
      });
      return n;
    };
    return { byId, gridIds, branchOf, creditOf, salesManagerOf, sellingCount };
  }, [orgUsers, managers]);

  // Team filter = the manager's real reporting branch, not their visibility
  // scope (getScopedUserIds returns the whole org for global roles, which
  // made "Shivbrata's team" a no-op that included Finance).
  const teamIds = useMemo(() => teamF === "All" ? null : orgGraph.branchOf(teamF), [teamF, orgGraph]);
  const managerOf = (uid) => {
    const mid = orgGraph.salesManagerOf(uid);
    return mid ? userName(mid) : "";
  };

  // Won-stage names resolved from Masters, so renaming the stage doesn't
  // silently zero this page. See wonStageNames().
  const wonNames = useMemo(() => wonStageNames(masters), [masters]);
  const isWon = (o) => wonNames.has(o?.stage);

  // Auto-compute achievement for a target from won opps (revenue + deal count)
  // and call reports (calls), matched on owner × fiscal-quarter × product.
  const computeAchievement = (t) => {
    let rev = 0, deals = 0, calls = 0;
    (opps || []).forEach(o => {
      if (o.owner !== t.userId || !isWon(o)) return;
      if (periodOf(o.closeDate) !== t.period) return;
      if (!prodMatches(t.product, o.products)) return;
      rev += Number(o.value) || 0; deals += 1;
    });
    (callReports || []).forEach(r => {
      if (r.marketingPerson !== t.userId) return;
      if (periodOf(r.callDate) !== t.period) return;
      if (!prodMatches(t.product, r.productSelection, r.product)) return;
      calls += 1;
    });
    return { achievedValue: +rev.toFixed(2), achievedDeals: deals, achievedCalls: calls };
  };
  // Targets with achievement overlaid from live CRM data (ignores any stored
  // manual achieved* values so the screen always reflects reality).
  const enriched = useMemo(() => targets.map(t => ({ ...t, ...computeAchievement(t) })), [targets, opps, callReports, wonNames]);

  const periods = useMemo(() => [...new Set(enriched.map(t => t.period))].sort().reverse(), [enriched]);

  // Selectable periods for the form: current FY ±1, all four quarters, newest first.
  const periodOptions = useMemo(() => {
    const now = new Date();
    const curFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const opts = [];
    for (let fy = curFy + 1; fy >= curFy - 1; fy--) for (let q = 4; q >= 1; q--) opts.push(`${fy}-Q${q}`);
    return opts;
  }, []);

  // Target TYPE is derived, not stored (Company / Vertical / Product /
  // Individual). Company = a company-wide (product All) target held by the
  // plan tier; Product = product-specific; Individual = held by a team member.
  const managerIds = useMemo(() => new Set(managers.map(m => m.id)), [managers]);
  // Top of the sales line (the VP) — only THEIR company-wide rows are the
  // company plan; a Line Manager's "All Products" target is an allocation.
  const topIds = useMemo(() => {
    const byId = Object.fromEntries(userOpts.map(u => [u.id, u]));
    const isLead = (u) => ABP_OWNER_ROLES.includes(String(u?.role || "").trim().toLowerCase());
    return new Set(managers.filter(u => !isLead(byId[u.reportsTo])).map(u => u.id));
  }, [managers, orgUsers]);
  const typeOfTarget = (t) => {
    const wide = !t.product || t.product === "All";
    if (wide && topIds.has(t.userId)) return "Company";
    if (!wide) return t.vertical ? "Vertical" : "Product";
    return "Individual";
  };

  const fys = useMemo(() => [...new Set(enriched.map(t => fyOf(t.period)).filter(Boolean))].sort().reverse(), [enriched]);
  const verticals = verticalOptions(masters);

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (fyF !== "All") list = list.filter(t => fyOf(t.period) === fyF);
    if (periodF !== "All") list = list.filter(t => t.period === periodF);
    // "__company" = the company-wide targets, which store product "All".
    if (productF === "__company") list = list.filter(t => !t.product || t.product === "All");
    else if (productF !== "All") list = list.filter(t => t.product === productF);
    if (verticalF !== "All") list = list.filter(t => t.vertical === verticalF);
    if (teamIds) list = list.filter(t => teamIds.has(t.userId));
    if (salesF !== "All") list = list.filter(t => t.userId === salesF);
    if (typeF !== "All") list = list.filter(t => typeOfTarget(t) === typeF);
    return list;
  }, [enriched, fyF, periodF, productF, verticalF, teamIds, salesF, typeF, managerIds]);

  // ── Overlapping commitments ──
  // Nothing stops two targets covering the same salesperson, period and
  // product — the live data already carries a pair like that. Because
  // achievement is computed PER TARGET, both rows claim the same won deals,
  // so the old `sum of every row's achieved` double-counted them. A softer
  // version of the same problem: an "All Products" target and a
  // product-specific one for the same person and period both match that
  // product's deals.
  //
  // Exact duplicates are now blocked on save and flagged below; for anything
  // already in the data, the KPI cards count each won deal ONCE instead of
  // once per matching target.
  const dupKeys = useMemo(() => {
    const seen = {};
    filtered.forEach(t => {
      const k = `${t.userId}|${t.period}|${t.product || "All"}`;
      seen[k] = (seen[k] || 0) + 1;
    });
    return new Set(Object.keys(seen).filter(k => seen[k] > 1));
  }, [filtered]);
  const keyOf = (t) => `${t.userId}|${t.period}|${t.product || "All"}`;

  // People holding both a company-wide and a product-specific target in the
  // same period — legitimate (a split quota), but their achievement overlaps.
  const overlapCount = useMemo(() => {
    const wide = new Set(), narrow = new Set();
    filtered.forEach(t => {
      const k = `${t.userId}|${t.period}`;
      (!t.product || t.product === "All" ? wide : narrow).add(k);
    });
    return [...narrow].filter(k => wide.has(k)).length;
  }, [filtered]);

  // ── The deal ledger ──
  // Every won deal classified ONCE: period, value, seller, products, and the
  // department that originated it. The KPI cards, owner-table splits,
  // contribution section and every drill-down all read from this single list —
  // one source of truth is what makes "no double counting" checkable rather
  // than hoped-for.
  const lostNames = useMemo(() => lostStageNames(masters), [masters]);
  const leadById = useMemo(() => Object.fromEntries((leads || []).map(l => [l.id, l])), [leads]);
  const ledger = useMemo(() =>
    (opps || [])
      .filter(o => o?.id && isWon(o))
      .map(o => ({
        id: o.id, title: o.title || o.oppNo || o.id, accountId: o.accountId,
        owner: o.owner, per: periodOf(o.closeDate), closeDate: o.closeDate,
        products: Array.isArray(o.products) ? o.products : [],
        value: Number(o.value) || 0,
        origin: originOf(o, leadById),
      })),
    [opps, wonNames, leadById]);
  // Open pipeline: neither won nor lost. An open deal with no close date is
  // still pipeline (it just is not booked to a quarter yet), so it matches
  // any period — unlike won revenue, where an undated deal is a data error.
  const openDeals = useMemo(() =>
    (opps || []).filter(o => o?.id && !isWon(o) && !lostNames.has(o?.stage))
      .map(o => ({ id: o.id, owner: o.owner, per: periodOf(o.closeDate),
        products: Array.isArray(o.products) ? o.products : [], value: Number(o.value) || 0 })),
    [opps, wonNames, lostNames]);

  // The (period, product) commitments in scope; achievement figures also
  // respect the contribution-source filter.
  const scopePairs = useMemo(() => {
    const pairs = new Set();
    filtered.forEach(t => pairs.add(`${t.period}|${t.product || "All"}`));
    return pairs;
  }, [filtered]);
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
  const ledgerScoped = useMemo(() =>
    ledger.filter(d => pairMatch(scopePairs, d.per, d.products))
          .filter(d => sourceF === "All" || d.origin === sourceF),
    [ledger, scopePairs, sourceF]);

  // ── Company ABP ──
  // The company plan is the CONSOLIDATION of every commitment, each target
  // counted once — the VP's own company-wide rows plus every Line Manager /
  // salesperson allocation. The split between "held company-wide" and
  // "allocated to teams" is shown on the card so the distribution stays
  // visible without ever double-counting a row.
  const companyTarget = +filtered.filter(t => typeOfTarget(t) === "Company")
    .reduce((s, t) => s + (Number(t.targetValue) || 0), 0).toFixed(2);
  const allRowsTarget = +filtered.reduce((s, t) => s + (Number(t.targetValue) || 0), 0).toFixed(2);
  const allocatedTarget = +(allRowsTarget - companyTarget).toFixed(2);
  const totalTarget = allRowsTarget;
  const totalTargetDeals = filtered.reduce((s, t) => s + (Number(t.targetDeals) || 0), 0);

  // Achieved: every won deal matching an in-scope commitment, counted once —
  // whoever sold it (ownership model: a deal counts toward the plan even when
  // the seller personally holds no target row).
  const totalAchieved = +ledgerScoped.reduce((s, d) => s + d.value, 0).toFixed(2);
  const totalAchievedDeals = ledgerScoped.length;
  const overallPct = totalTarget > 0 ? +((totalAchieved / totalTarget) * 100).toFixed(1) : 0;
  const totalGap = +(totalTarget - totalAchieved).toFixed(2);

  // Qualified pipeline against the remaining plan.
  const totalPipeline = +openDeals
    .filter(d => pairMatch(scopePairs, d.per, d.products) || (!d.per && scopePairs.size > 0))
    .reduce((s, d) => s + d.value, 0).toFixed(2);

  // Win rate over deals closed in scope (won vs lost).
  const winRate = useMemo(() => {
    const lost = (opps || []).filter(o => lostNames.has(o?.stage) && pairMatch(scopePairs, periodOf(o.closeDate), Array.isArray(o.products) ? o.products : [])).length;
    const closed = totalAchievedDeals + lost;
    return closed > 0 ? Math.round((totalAchievedDeals / closed) * 100) : null;
  }, [opps, lostNames, scopePairs, totalAchievedDeals]);

  // Won deals that can't be booked to any quarter because they have no close
  // date. They are silently absent from every attainment figure, so say so.
  const undatedWon = useMemo(
    () => (opps || []).filter(o => isWon(o) && !periodOf(o.closeDate)).length,
    [opps, wonNames]);

  const pg = usePagination(filtered);

  // Chart data — groupable by salesperson / line manager / product /
  // vertical. Achievement comes from the DEDUPED ledger (a deal counted once
  // per group), not from per-target sums, which double-counted whenever two
  // targets overlapped. NB: grouping by product books a multi-product deal
  // into each of its products — a breakdown view, flagged in the caption.
  const chartData = useMemo(() => {
    const groups = {};
    const add = (key, name, field, v) => {
      if (!key) return;
      const g = groups[key] || (groups[key] = { name, target: 0, achieved: 0, deals: 0 });
      g[field] = +(g[field] + v).toFixed(2);
      if (field === "achieved") g.deals += 1;
    };
    // Nearest ABP owner (self for grid members) — a target held by Sudhir
    // groups under the VP, not under the Product Head; a support engineer's
    // stray deal groups under their Line Manager.
    const mgrIdOf = (uid2) => { const m2 = orgGraph.creditOf(uid2); return m2 === "__none" ? "" : m2; };
    filtered.forEach(t => {
      const v = Number(t.targetValue) || 0;
      if (groupBy === "salesperson") add(t.userId, (userName(t.userId) || "?").split(" ")[0], "target", v);
      else if (groupBy === "manager") { const mid = managerIds.has(t.userId) ? t.userId : mgrIdOf(t.userId); add(mid, (userName(mid) || "?").split(" ")[0], "target", v); }
      else if (groupBy === "product") add(t.product || "All", t.product && t.product !== "All" ? (PROD_MAP[t.product]?.name || t.product) : "Company-wide", "target", v);
      else add(t.vertical || "—", t.vertical || "Unassigned", "target", v);
    });
    ledgerScoped.forEach(d => {
      if (groupBy === "salesperson") add(d.owner, (userName(d.owner) || "?").split(" ")[0], "achieved", d.value);
      else if (groupBy === "manager") { const mid = managerIds.has(d.owner) ? d.owner : mgrIdOf(d.owner); add(mid, (userName(mid) || "?").split(" ")[0], "achieved", d.value); }
      else if (groupBy === "product") (d.products.length ? d.products : ["All"]).forEach(pid => add(pid, PROD_MAP[pid]?.name || pid, "achieved", d.value));
      else {
        const vset = new Set(filtered.filter(t => t.userId === d.owner && t.vertical).map(t => t.vertical));
        add([...vset][0] || "—", [...vset][0] || "Unassigned", "achieved", d.value);
      }
    });
    return Object.values(groups).map(g => ({ ...g,
      pct: g.target > 0 ? Math.round((g.achieved / g.target) * 100) : null,
      gap: +(g.target - g.achieved).toFixed(2),
    })).sort((a, b) => b.target - a.target);
  }, [filtered, ledgerScoped, groupBy, orgUsers, managerIds, orgGraph]);

  // ── ABP / AOP rollup ──
  // The annual plan is distributed across the Line Managers by vertical and
  // product; whatever stays company-level is owned by the VP. Each row
  // therefore answers two different questions, which is why it carries two
  // sets of figures:
  //
  //   ABP (owned)    — the commitment this person is ACCOUNTABLE for, and the
  //                    revenue booked against it from ANY seller. A product's
  //                    number belongs to the manager who owns that product,
  //                    whoever closed the deal.
  //   Team sold      — what this person's own reports actually closed, across
  //                    the WHOLE portfolio, because every team is expected to
  //                    cross-sell outside its primary line.
  //
  // The gap between them is the cross-sell story: positive Δ means this team
  // sold more into other lines than other teams sold into theirs.
  //
  // Neither figure double-counts inside itself — a deal matching several of a
  // person's commitments is counted once. Across rows they deliberately
  // overlap (a cross-sold deal appears in one manager's ABP and another's Team
  // sold), so only the ABP Target column is meant to reconcile with the page
  // totals above.
  const byManager = useMemo(() => {
    const users = orgUsers || [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const gridIds = new Set(managers.map(m => m.id));

    // Branch / credit walks come from the shared org graph so every widget
    // agrees on what the hierarchy means.
    const { branchOf, creditOf } = orgGraph;

    // Every target, grouped under the ABP owner accountable for it.
    const credited = {};
    filtered.forEach(t => {
      const key = creditOf(t.userId);
      const c = credited[key] || (credited[key] = {
        target: 0, deals: 0, people: new Set(), pairs: new Set(), products: new Set(), verticals: new Set(), rows: [],
      });
      c.target += Number(t.targetValue) || 0;
      c.deals += Number(t.targetDeals) || 0;
      c.people.add(t.userId);
      // The (period, product) commitments this owner is measured against.
      // A blank product means the company-level objective, which matches
      // every product — that is the VP's row.
      c.pairs.add(`${t.period}|${t.product || "All"}`);
      if (t.product && t.product !== "All") c.products.add(t.product);
      if (t.vertical) c.verticals.add(t.vertical);
      c.rows.push(t);
    });

    // Periods currently in view — used to scope "team sold" for a manager who
    // holds no target yet, so their team's contribution is still visible.
    const visiblePeriods = [...new Set(filtered.map(t => t.period).filter(Boolean))];

    // Deals matching a set of "period|product" commitments, taken from the
    // scoped ledger so the contribution-source filter applies here too. Each
    // deal appears once even when several commitments would match it.
    const dealsFor = (pairs, owners) => ledgerScoped.filter(d => {
      if (owners && !owners.has(d.owner)) return false;
      return pairMatch(pairs, d.per, d.products);
    });
    const sum = (ds) => +ds.reduce((acc, d) => acc + d.value, 0).toFixed(2);

    const teamPairs = new Set(visiblePeriods.map(p => `${p}|All`));

    // The top of the sales line (the VP) is a CONSOLIDATION: every
    // allocation beneath them is part of their number, so their row carries
    // the union of the whole branch's commitments — own targets plus every
    // Line Manager's slice, each counted once. "Amit's ₹75L" is IN the VP's
    // figure, not beside it. LM rows remain the distribution of that plan,
    // so the ABP Target column must not be summed down (footnote says so).
    const isSalesLead2 = (u) => ABP_OWNER_ROLES.includes(String(u?.role || "").trim().toLowerCase());
    const tops = new Set(managers.filter(u => !isSalesLead2(byId[u.reportsTo])).map(u => u.id));

    // EVERY ABP owner gets a row — including one with no target yet, so a
    // missing commitment is visible instead of the manager silently absent.
    const rows = managers.map(m => {
      const isTop = tops.has(m.id);
      const branchIds = branchOf(m.id);
      let pairs, abpTarget, consolidated = false;
      if (isTop) {
        // Union of every commitment held anywhere in the branch.
        pairs = new Set(); abpTarget = 0;
        Object.entries(credited).forEach(([ownerId, c2]) => {
          if (ownerId !== "__none" && !branchIds.has(ownerId)) return;
          if (ownerId === "__none") return;
          c2.pairs.forEach(pr => pairs.add(pr));
          abpTarget += c2.target;
        });
        abpTarget = +abpTarget.toFixed(2);
        consolidated = pairs.size > 0 && (credited[m.id] ? abpTarget > credited[m.id].target : true);
      } else {
        const c = credited[m.id];
        pairs = c ? c.pairs : new Set();
        abpTarget = c ? c.target : 0;
      }
      const c = credited[m.id];

      // Accountability: deals on the commitments this owner holds (for the
      // top row: the whole consolidated plan), from ANY seller — then
      // PARTITIONED by who sold them, so the columns sum to Total Achieved
      // with nothing counted twice:
      //   own (the owner personally) + team (their branch) + crossIn
      //   (sellers outside the branch) = total.
      const abpDeals = pairs.size ? dealsFor(pairs, null) : [];
      const ownDeals   = abpDeals.filter(d => d.owner === m.id);
      const teamDeals  = abpDeals.filter(d => d.owner !== m.id && branchIds.has(d.owner));
      const crossInDeals = abpDeals.filter(d => !branchIds.has(d.owner));
      // Origin overlay (informational — a subset of the partition above, NOT
      // an extra column to add): deals a non-sales department originated.
      const deptDeals = abpDeals.filter(d => d.origin !== "Direct Sales" && d.origin !== "Cross-Sell");

      // Contribution: what this branch closed across the whole portfolio,
      // and the slice of it that lands in OTHER owners' plans (cross-out).
      const soldDeals = dealsFor(teamPairs, branchIds);
      const soldIds = new Set(abpDeals.map(d => d.id));
      const crossOutDeals = soldDeals.filter(d => !soldIds.has(d.id));

      // Open pipeline on the owner's commitments (any seller), undated open
      // deals included — they are pipeline that just isn't quarter-booked yet.
      const pipeline = +openDeals
        .filter(d => pairs.size && (pairMatch(pairs, d.per, d.products) || !d.per))
        .reduce((acc, d) => acc + d.value, 0).toFixed(2);

      const achieved = sum(abpDeals);
      return {
        mgrId: m.id, role: m.role || "",
        consolidated,
        products: c ? [...c.products] : [],
        verticals: c ? [...c.verticals] : [],
        companyWide: [...(c ? c.pairs : pairs)].some(pr => pr.endsWith("|All")),
        headcount: orgGraph.sellingCount(m.id),       // quota-carrying reports only
        target: abpTarget,
        achieved,
        own: sum(ownDeals), team: sum(teamDeals), crossIn: sum(crossInDeals),
        dept: sum(deptDeals),
        crossOut: sum(crossOutDeals),
        pipeline,
        wonDeals: abpDeals.length,
        deals: c ? c.deals : 0,
        teamSold: sum(soldDeals),
        pct: abpTarget > 0 ? Math.round((achieved / abpTarget) * 100) : null,
        gap: +(abpTarget - achieved).toFixed(2),
        drillDeals: abpDeals,           // powers click-through to the deals
        targetRows: c ? c.rows : [],    // commitments credited to THIS owner (goals editor)
      };
    });

    // Any target whose owner sits outside the sales roles stays visible, so
    // the ABP Target column can never silently under-sum the page total.
    const o = credited["__none"];
    if (o && o.target > 0) {
      const abpDeals = dealsFor(o.pairs, null);
      rows.push({
        mgrId: "__none", role: "", consolidated: false, products: [], verticals: [], companyWide: false,
        headcount: o.people.size, target: o.target, achieved: sum(abpDeals),
        own: 0, team: 0, crossIn: sum(abpDeals), dept: 0, crossOut: 0, pipeline: 0,
        wonDeals: abpDeals.length, deals: o.deals, teamSold: 0,
        pct: o.target > 0 ? Math.round((sum(abpDeals) / o.target) * 100) : null,
        gap: +(o.target - sum(abpDeals)).toFixed(2), drillDeals: abpDeals,
        targetRows: o.rows,
      });
    }
    return rows.sort((a, b) => b.target - a.target || b.teamSold - a.teamSold);
  }, [filtered, orgUsers, managers, ledgerScoped, openDeals, orgGraph]);

  // Company-level cross-sell = revenue that landed in an owner's plan from a
  // seller OUTSIDE that owner's branch. Summed over Line-Manager rows only —
  // the consolidation row and company-wide commitments match everything by
  // definition and would re-count every cross-sold deal.
  const crossSellTotal = +byManager
    .filter(r => r.mgrId !== "__none" && !r.consolidated && !r.companyWide)
    .reduce((acc, r) => acc + r.crossIn, 0).toFixed(2);

  // True while every Line Manager's commitment is "All Products". In that
  // state structural cross-sell is undefined (there is no product boundary to
  // cross), every owner's figures overlap the same deals, and the fix is in
  // the DATA — scope targets by product/vertical. The UI says so explicitly
  // rather than showing numbers that contradict each other.
  const allCompanyWide = byManager.length > 0 &&
    byManager.filter(r => r.mgrId !== "__none" && !r.consolidated && r.target > 0)
             .every(r => r.companyWide);

  // ── Hans portfolio ──
  // Per-product plan vs revenue from the live catalog. A deal carrying
  // several products is shown under each (breakdown view — the company totals
  // above stay deal-deduped). Cross-sell per product = revenue where the
  // seller's credited owner does not hold that product.
  const portfolio = useMemo(() => {
    const ownerProducts = {};   // creditOwnerId → Set(products)
    byManager.forEach(r => { if (r.mgrId !== "__none") ownerProducts[r.mgrId] = new Set(r.products); });
    const creditOwnerOf = (uid2) => { const m2 = orgGraph.creditOf(uid2); return m2 === "__none" ? null : m2; };
    return PRODUCTS.map(prod => {
      const target = +filtered.filter(t => t.product === prod.id)
        .reduce((acc, t) => acc + (Number(t.targetValue) || 0), 0).toFixed(2);
      const deals = ledgerScoped.filter(d => d.products.includes(prod.id));
      const revenue = +deals.reduce((acc, d) => acc + d.value, 0).toFixed(2);
      const crossSell = +deals.filter(d => {
        // Cross-sell needs a product boundary to cross. An owner whose
        // commitments are company-wide (empty product set) has no boundary,
        // so nothing their team sells is "cross" — the earlier version
        // treated the empty set as owning NOTHING and marked 100% of all
        // revenue as cross-sell.
        const own = ownerProducts[creditOwnerOf(d.owner)];
        return own && own.size > 0 ? !own.has(prod.id) : false;
      }).reduce((acc, d) => acc + d.value, 0).toFixed(2);
      const customers = new Set(deals.map(d => d.accountId).filter(Boolean)).size;
      return { id: prod.id, name: prod.name, target, revenue, crossSell, customers, dealCount: deals.length };
    }).filter(prow => prow.target > 0 || prow.revenue > 0);
  }, [filtered, ledgerScoped, byManager, orgUsers, managers, orgGraph]);

  // ── Contribution by source ──
  // Won revenue in scope grouped by originating department, plus raw lead
  // counts by the same mapping so lead-generation effort is visible before
  // anything converts.
  const contribRows = useMemo(() => {
    const rows = Object.fromEntries(CONTRIB_SOURCES.map(src => [src, { source: src, revenue: 0, deals: 0, leads: 0, dealsList: [] }]));
    ledgerScoped.forEach(d => {
      const r = rows[d.origin] || rows["Other"];
      r.revenue = +(r.revenue + d.value).toFixed(2); r.deals += 1; r.dealsList.push(d);
    });
    (leads || []).forEach(l => {
      if (l.isDeleted) return;
      const dept = LEAD_SOURCE_DEPT[String(l.source || "").toLowerCase()] || "Direct Sales";
      (rows[dept] || rows["Other"]).leads += 1;
    });
    return Object.values(rows);
  }, [ledgerScoped, leads]);

  // presetUserId lets the per-owner goals editor open the form pre-filled.
  // Always called via an arrow fn — passing it straight to onClick would hand
  // it the click event as presetUserId.
  const openAdd = (presetUserId) => {
    setForm({ ...BLANK_TARGET, id: `tgt${uid()}`, period: periods[0] || "2026-Q1",
      userId: (typeof presetUserId === "string" && presetUserId) || currentUser || BLANK_TARGET.userId });
    setFormErrors({});
    setModal({ mode: "add" });
  };
  const openEdit = (t) => { setForm({ ...t }); setFormErrors({}); setModal({ mode: "edit" }); };
  const save = () => {
    const errs = {};
    if (!form.userId) errs.userId = "Salesperson is required";
    if (!form.period?.trim()) errs.period = "Period is required";
    if (form.targetValue <= 0) errs.targetValue = "Target must be > 0";
    // One commitment per salesperson × period × product. A second one does not
    // mean "a bigger target" — achievement is computed per target, so the two
    // rows claim the same won deals and every roll-up above counts them twice.
    // Checked against ALL targets, not the filtered view, so a duplicate
    // hidden by the current filters is still caught.
    // Uniqueness scope: salesperson + period + product + vertical. Checked
    // against ALL targets (not the filtered view) so a duplicate hidden by
    // the current filters is still caught. The DB carries the same rule as a
    // partial unique index (add_target_vertical_and_unique_v1.sql), so the
    // constraint holds even for writes that bypass this form.
    const dupe = targets.find(t =>
      t.id !== form.id && !t.isDeleted &&
      t.userId === form.userId &&
      t.period === form.period &&
      (t.product || "All") === (form.product || "All") &&
      (t.vertical || "") === (form.vertical || ""));
    if (dupe) {
      errs.period = `${userName(form.userId)} already has a ${(!form.product || form.product === "All") ? "company-wide" : (PROD_MAP[form.product]?.name || form.product)} target for ${form.period} (₹${dupe.targetValue}L). Edit that one instead — a second target double-counts the same won deals.`;
    }
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj(form);
    if (modal.mode === "add") setTargets(p => [...p, { ...clean }]);
    else setTargets(p => p.map(t => t.id === clean.id ? { ...clean } : t));
    setModal(null); setFormErrors({});
  };
  const del = (id) => { setTargets(p => softDeleteById(p, id, currentUser)); setConfirm(null); };

  const pctColor = (pct) => pct >= 100 ? "#22C55E" : pct >= 75 ? "#F59E0B" : pct >= 50 ? "#F97316" : "#EF4444";

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Target vs Achievement</div>
          <div className="pg-sub">
            {fmt.inr(totalTarget)} {companyTarget > 0 ? "company ABP" : "target"} · {fmt.inr(totalAchieved)} achieved · {overallPct}% · {fmt.inr(totalPipeline)} pipeline
          </div>
        </div>
        <div className="pg-actions">
          {/* Export resolves names from LIVE users (CSV_COLS' static TEAM_MAP
              left real Supabase users blank) and includes the line manager. */}
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, [
            { label: "Salesperson", accessor: t => userName(t.userId) },
            { label: "Line Manager", accessor: t => managerOf(t.userId) },
            ...CSV_COLS.slice(1),
          ], "targets")}><Download size={14}/>Export</button>
          {canWrite && <button className="btn btn-primary" onClick={() => openAdd()}><Plus size={14}/>Add Target</button>}
        </div>
      </div>

      {/* KPI Cards — company ABP is the plan, not the sum of its allocations */}
      <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12,marginBottom:16}}>
        <div className="kpi">
          <div className="kpi-label">Company ABP</div>
          <div className="kpi-val">{fmt.inr(totalTarget)}</div>
          {companyTarget > 0 && allocatedTarget > 0 && (
            <div className="kpi-sub" title="The plan consolidates to the VP: company-wide commitments plus every team allocation, each counted once.">
              {fmt.inr(companyTarget)} company-wide · {fmt.inr(allocatedTarget)} allocated
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="kpi-label">Achieved</div>
          <div className="kpi-val" style={{color:pctColor(+overallPct)}}>{fmt.inr(totalAchieved)}</div>
          <div className="kpi-sub"><span style={{color:pctColor(+overallPct),fontWeight:700}}>{overallPct}%</span> of target · each deal counted once</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Gap</div>
          <div className="kpi-val" style={{color: totalGap > 0 ? "var(--red)" : "var(--green)"}}>{fmt.inr(Math.abs(totalGap))}</div>
          {totalGap < 0 && <div className="kpi-sub">ahead of plan</div>}
        </div>
        <div className="kpi">
          <div className="kpi-label">Pipeline</div>
          <div className="kpi-val" style={{color:"var(--brand)"}}>{fmt.inr(totalPipeline)}</div>
          <div className="kpi-sub">{totalGap > 0
            ? (totalPipeline >= totalGap
                ? `covers the remaining gap ${(totalPipeline / totalGap).toFixed(1)}×`
                : `${Math.round((totalPipeline / totalGap) * 100)}% of remaining gap`)
            : "open deals in scope"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Cross-sell</div>
          <div className="kpi-val" style={{color:"#7C3AED"}}>{fmt.inr(crossSellTotal)}</div>
          <div className="kpi-sub">
            {crossSellTotal > 0 && totalAchieved > 0
              ? `${Math.round((crossSellTotal / totalAchieved) * 100)}% of achieved`
              : allCompanyWide
                ? "needs product-scoped targets"
                : "sold outside own line"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Deals</div>
          <div className="kpi-val">{totalAchievedDeals}/{totalTargetDeals}</div>
          <div className="kpi-sub">{winRate !== null ? `${winRate}% win rate` : "no closed deals in scope"}</div>
        </div>
      </div>

      {/* Chart — grouping switches between the plan's four axes; achievement
          is deduped per group via the ledger. Bar width scales with count so
          two records don't float in an empty chart. */}
      {chartData.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-title" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            Target vs Achievement (₹L)
            <div style={{marginLeft:"auto",display:"flex",gap:0,border:"1.5px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
              {[["salesperson","Salesperson"],["manager","Line Manager"],["product","Product"],["vertical","Vertical"]].map(([k,label]) => (
                <button key={k} onClick={() => setGroupBy(k)}
                  style={{fontSize:11,padding:"4px 10px",fontWeight:600,cursor:"pointer",border:"none",
                    background: groupBy === k ? "var(--brand)" : "#fff", color: groupBy === k ? "#fff" : "var(--text2)"}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(180, Math.min(260, 120 + chartData.length * 18))}>
            <BarChart data={chartData} barGap={4} barCategoryGap="22%" maxBarSize={44}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
              <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={{borderRadius:8,fontSize:12}} content={({active, payload, label}) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{background:"#fff",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",fontSize:12,boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}>
                    <div style={{fontWeight:700,marginBottom:4}}>{label}</div>
                    <div>Target <b>{fmt.inr(d.target)}</b></div>
                    <div>Achieved <b style={{color:pctColor(d.pct ?? 0)}}>{fmt.inr(d.achieved)}</b></div>
                    {d.pct !== null && <div>Attainment <b>{d.pct}%</b></div>}
                    <div>Gap <b>{fmt.inr(Math.abs(d.gap))}{d.gap < 0 ? " ahead" : ""}</b></div>
                    <div>Deals won <b>{d.deals}</b></div>
                  </div>
                );
              }}/>
              <Legend wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="target" name="Target" fill="#94A3B8" radius={[4,4,0,0]}/>
              <Bar dataKey="achieved" name="Achieved" fill="var(--brand)" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
          {groupBy === "product" && <div style={{fontSize:10.5,color:"var(--text3)",marginTop:4}}>A deal carrying several products appears in each of its products — a breakdown view, not a sum.</div>}
        </div>
      )}

      {/* ── ABP / AOP rollup ── accountability vs contribution ── */}
      {byManager.length > 0 && (
        <div className="card" style={{padding:0, marginBottom:16}}>
          <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:13, fontWeight:700, color:"var(--text1)", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            <Users size={15} style={{color:"var(--brand)"}}/> ABP / AOP by owner
            <span style={{fontSize:11, fontWeight:400, color:"var(--text3)"}}>
              one hierarchy · clear ownership · multiple contributors · no double counting — reflects the filters below
            </span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{minWidth:1150}}>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Role</th>
                  <th>Vertical / Products</th>
                  <th style={{textAlign:"right"}} title="Quota-carrying people in this branch — support engineers report here too but don't count toward selling capacity">Team</th>
                  <th style={{textAlign:"right"}}>ABP Target</th>
                  <th style={{textAlign:"right"}} title="Deals the owner closed personally on their own plan">Own</th>
                  <th style={{textAlign:"right"}} title="Deals the owner's branch closed on the plan (excluding the owner)">Team</th>
                  <th style={{textAlign:"right"}} title="Deals sellers OUTSIDE this branch closed into this owner's plan">Cross-in</th>
                  <th style={{textAlign:"right"}} title="Own + Team + Cross-in — every deal counted once. Click to see the deals.">Total Achieved</th>
                  <th>Attainment</th>
                  <th style={{textAlign:"right"}} title="Revenue this branch closed into OTHER owners' plans">Cross-out</th>
                  <th style={{textAlign:"right"}} title="Of Total Achieved, deals originated by a non-sales department (Marketing, Pre-Sales, Customer Success, Partner, Operations). A subset of the partition, not an addition.">via Depts</th>
                  <th style={{textAlign:"right"}}>Pipeline</th>
                  <th style={{textAlign:"right"}}>Deals (T/A)</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {byManager.map(r => (
                  <tr key={r.mgrId}>
                    <td style={{fontWeight:600, cursor: r.mgrId !== "__none" ? "pointer" : "default"}}
                      onClick={() => r.mgrId !== "__none" && setTeamF(teamF === r.mgrId ? "All" : r.mgrId)}
                      title={r.mgrId !== "__none" ? "Click to filter the page to this team" : ""}>
                      {r.mgrId === "__none" ? <span style={{color:"var(--text3)"}}>— Outside sales roles —</span> : userName(r.mgrId)}
                    </td>
                    <td style={{fontSize:11, color:"var(--text3)"}}>{(r.role || "").replace(/_/g," ") || "—"}</td>
                    <td style={{fontSize:11}}>
                      {r.products.length === 0 && r.verticals.length === 0 && !r.companyWide && <span style={{color:"var(--text3)"}}>—</span>}
                      {r.consolidated && <span style={{fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:"#0F766E", background:"#0D948818", marginRight:4}} title="This row is the whole plan: own commitments plus every allocation beneath, each counted once. Don't add the rows below to it.">Consolidated</span>}
                      {!r.consolidated && r.companyWide && <span style={{fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:"#0F766E", background:"#0D948818", marginRight:4}}>Company-wide</span>}
                      {r.verticals.map(v => (
                        <span key={v} style={{fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:"#9333EA", background:"#9333EA15", marginRight:4}}>{v}</span>
                      ))}
                      {r.products.map(pid => (
                        <span key={pid} style={{fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:"#1E40AF", background:"#1E40AF18", marginRight:4}}>
                          {PROD_MAP[pid]?.name || pid}
                        </span>
                      ))}
                    </td>
                    <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{r.headcount || "—"}</td>
                    <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", fontWeight:700}}>{fmt.inr(r.target)}</td>
                    <td style={{textAlign:"right", fontSize:12}}>{r.own ? fmt.inr(r.own) : <span style={{color:"var(--text3)"}}>—</span>}</td>
                    <td style={{textAlign:"right", fontSize:12}}>{r.team ? fmt.inr(r.team) : <span style={{color:"var(--text3)"}}>—</span>}</td>
                    <td style={{textAlign:"right", fontSize:12, color: r.companyWide && !r.consolidated ? "var(--text3)" : "#7C3AED"}}
                      title={r.companyWide && !r.consolidated ? "This commitment spans all products, so \"cross\" has no boundary — these are simply deals closed by sellers outside the branch. Scope the target by product/vertical for true cross-sell." : undefined}>
                      {r.crossIn ? fmt.inr(r.crossIn) : <span style={{color:"var(--text3)"}}>—</span>}{r.companyWide && !r.consolidated && r.crossIn ? " *" : ""}</td>
                    <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", fontWeight:700, color:pctColor(r.pct ?? 0), cursor: r.drillDeals.length ? "pointer" : "default", textDecoration: r.drillDeals.length ? "underline dotted" : "none"}}
                      onClick={(e) => { e.stopPropagation(); if (r.drillDeals.length) setDrill({ title: `${r.mgrId === "__none" ? "Outside sales roles" : userName(r.mgrId)} — ${fmt.inr(r.achieved)} achieved`, deals: r.drillDeals }); }}
                      title={r.drillDeals.length ? "Click to see the contributing deals" : ""}>
                      {fmt.inr(r.achieved)}
                    </td>
                    <td>
                      {r.pct === null ? <span style={{color:"var(--text3)", fontSize:11}}>no target</span> : (
                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                          <div style={{width:54, height:6, background:"#E2E8F0", borderRadius:3, overflow:"hidden"}}>
                            <div style={{width:`${Math.min(r.pct,100)}%`, height:"100%", background:pctColor(r.pct), borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:12, fontWeight:700, color:pctColor(r.pct)}}>{r.pct}%</span>
                        </div>
                      )}
                    </td>
                    <td style={{textAlign:"right", fontSize:12, color: r.companyWide && !r.consolidated ? "var(--text3)" : "#0D9488"}}>{r.crossOut ? fmt.inr(r.crossOut) : <span style={{color:"var(--text3)"}}>—</span>}</td>
                    <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{r.dept ? fmt.inr(r.dept) : "—"}</td>
                    <td style={{textAlign:"right", fontSize:12, color:"var(--brand)"}}>{r.pipeline ? fmt.inr(r.pipeline) : <span style={{color:"var(--text3)"}}>—</span>}</td>
                    <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{r.deals}/{r.wonDeals}</td>
                    {canWrite && (
                      <td style={{textAlign:"right"}}>
                        {r.mgrId !== "__none" && (
                          <button className="icon-btn" aria-label="Edit goals" title="View and edit this owner's goals"
                            onClick={() => setGoalsFor(r.mgrId)}><Edit2 size={14}/></button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:"8px 14px", fontSize:11, color:"var(--text3)", borderTop:"1px solid var(--border)"}}>
            The <b>Consolidated</b> row is the company plan rolled up to the VP — every allocation beneath is inside it, so <b>don't sum the ABP Target column</b>; the Line Manager rows are its distribution. Per row, <b>Own + Team + Cross-in = Total Achieved</b> (a partition, every deal counted once); <b>Cross-out</b> and <b>via Depts</b> are informational overlays. A cross-sold deal appears in one owner's Cross-in and another's Cross-out by design.
          </div>
        </div>
      )}

      {/* ── Hans portfolio ── per-product plan vs revenue vs cross-sell.
          Renders from the LIVE product catalog (Masters → Product Catalogue),
          so adding Eannex / AMS / WiseStox / SmartCRM / SmartHRMS there makes
          them appear here — no code change. */}
      {portfolio.length > 0 && (
        <div className="card" style={{padding:0, marginBottom:16}}>
          <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:13, fontWeight:700, color:"var(--text1)", display:"flex", alignItems:"center", gap:8}}>
            <Package size={15} style={{color:"var(--brand)"}}/> Hans portfolio
            <span style={{fontSize:11, fontWeight:400, color:"var(--text3)"}}>click a product to focus the page on it · a multi-product deal appears under each of its products</span>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px, 1fr))", gap:0}}>
            {portfolio.map(pr => (
              <div key={pr.id} onClick={() => setProductF(productF === pr.id ? "All" : pr.id)}
                style={{padding:"10px 14px", borderRight:"1px solid var(--border)", borderBottom:"1px solid var(--border)", cursor:"pointer",
                  background: productF === pr.id ? "var(--s2)" : "transparent"}}>
                <div style={{fontSize:12, fontWeight:700, color: PROD_MAP[pr.id]?.color || "var(--text1)", marginBottom:4}}>{pr.name}</div>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)"}}><span>Target</span><b style={{color:"var(--text2)"}}>{pr.target ? fmt.inr(pr.target) : "—"}</b></div>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)"}}><span>Revenue</span><b style={{color:pr.target ? pctColor(pr.target > 0 ? Math.round((pr.revenue/pr.target)*100) : 0) : "var(--text2)"}}>{pr.revenue ? fmt.inr(pr.revenue) : "—"}</b></div>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)"}}><span>Cross-sell</span><b style={{color:"#7C3AED"}}>{pr.crossSell ? fmt.inr(pr.crossSell) : "—"}</b></div>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)"}}>
                  <span>{pr.customers} customer{pr.customers === 1 ? "" : "s"}</span>
                  <span>{pr.dealCount} deal{pr.dealCount === 1 ? "" : "s"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Contribution by source ── which department originated the business.
          Derived from data the CRM already captures (campaign source, opp
          source, linked lead source) — nothing is invented. */}
      {(contribRows.some(r => r.revenue > 0 || r.leads > 0)) && (
        <div className="card" style={{padding:0, marginBottom:16}}>
          <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:13, fontWeight:700, color:"var(--text1)", display:"flex", alignItems:"center", gap:8}}>
            <GitBranch size={15} style={{color:"var(--brand)"}}/> Contribution by source
            <span style={{fontSize:11, fontWeight:400, color:"var(--text3)"}}>where the business in scope originated · click a revenue figure for its deals</span>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:0}}>
            {contribRows.filter(r => r.revenue > 0 || r.leads > 0 || r.deals > 0).map(r => (
              <div key={r.source} style={{padding:"10px 14px", borderRight:"1px solid var(--border)", borderBottom:"1px solid var(--border)"}}>
                <div style={{fontSize:11.5, fontWeight:700, marginBottom:4}}>{r.source}</div>
                <div style={{fontSize:15, fontWeight:800, fontFamily:"'Outfit',sans-serif", color: r.revenue ? "var(--text1)" : "var(--text3)",
                    cursor: r.dealsList.length ? "pointer" : "default", textDecoration: r.dealsList.length ? "underline dotted" : "none"}}
                  onClick={() => r.dealsList.length && setDrill({ title: `${r.source} — ${fmt.inr(r.revenue)} originated`, deals: r.dealsList })}>
                  {r.revenue ? fmt.inr(r.revenue) : "—"}
                </div>
                <div style={{fontSize:10.5, color:"var(--text3)"}}>{r.deals} deal{r.deals === 1 ? "" : "s"} won{r.leads ? ` · ${r.leads} lead${r.leads === 1 ? "" : "s"}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data-quality notices — these distort attainment, so say so rather
          than letting the numbers quietly disagree with the pipeline. */}
      {(dupKeys.size > 0 || overlapCount > 0 || undatedWon > 0 || allCompanyWide) && (
        <div style={{marginBottom:12, padding:"10px 14px", borderRadius:8, border:"1px solid #F59E0B55", background:"#FFFBEB", fontSize:12, color:"#92400E", display:"flex", flexDirection:"column", gap:4}}>
          {dupKeys.size > 0 && (
            <div><b>{dupKeys.size} duplicate commitment{dupKeys.size === 1 ? "" : "s"}</b> — the same salesperson, period and product appears on more than one row (marked <b>duplicate</b> below). Each row claims the same won deals, so per-row attainment is inflated. Keep one and delete the rest.</div>
          )}
          {overlapCount > 0 && (
            <div><b>{overlapCount} overlapping commitment{overlapCount === 1 ? "" : "s"}</b> — someone holds a company-wide target and a product target for the same period, so that product's deals count toward both rows.</div>
          )}
          {allCompanyWide && (
            <div><b>Targets aren't product-scoped</b> — every Line Manager's commitment is "All Products", so their figures all match the same deals (marked *), cross-sell reads zero, and the portfolio strip has no per-product targets. Edit each target and set its Product / Vertical to give ownership a boundary.</div>
          )}
          {undatedWon > 0 && (
            <div><b>{undatedWon} won deal{undatedWon === 1 ? "" : "s"} with no close date</b> — they can't be booked to a quarter and are missing from every figure here. Set a close date on the deal to include them.</div>
          )}
          <div style={{color:"#B45309"}}>The cards above already count each won deal once, so they stay correct regardless.</div>
        </div>
      )}

      <div className="filter-bar" style={{flexWrap:"wrap"}}>
        {fys.length > 1 && (
          <select className="filter-select" value={fyF} onChange={e => { setFyF(e.target.value); setPeriodF("All"); }} title="Financial year (Apr–Mar)">
            <option value="All">All FYs</option>
            {fys.map(y => <option key={y} value={y}>FY {y}–{String(Number(y) + 1).slice(2)}</option>)}
          </select>
        )}
        <select className="filter-select" value={periodF} onChange={e => setPeriodF(e.target.value)} title="Annual = every quarter of the FY in scope">
          <option value="All">{fyF !== "All" ? "Annual" : "All Periods"}</option>
          {periods.filter(pr => fyF === "All" || fyOf(pr) === fyF).map(pr => <option key={pr}>{pr}</option>)}
        </select>
        {/* Product focus — surfaces the product-specific targets that drive
            per-LOB attainment on Reports → LOB Analysis. */}
        <select className="filter-select" value={productF} onChange={e => setProductF(e.target.value)}
          title="Filter by the target's product focus">
          <option value="All">Any Product Focus</option>
          <option value="__company">— Company-wide (All Products) —</option>
          {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {managers.length > 0 && (
          <select className="filter-select" value={teamF} onChange={e => setTeamF(e.target.value)}
            title="Roll up to one line manager's team (manager + all their reports)">
            <option value="All">All Teams</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.name}'s team</option>)}
          </select>
        )}
        <select className="filter-select" value={verticalF} onChange={e => setVerticalF(e.target.value)} title="Business vertical of the target">
          <option value="All">All Verticals</option>
          {verticals.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={salesF} onChange={e => setSalesF(e.target.value)} title="One salesperson's targets">
          <option value="All">All Salespeople</option>
          {userOpts.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="filter-select" value={typeF} onChange={e => setTypeF(e.target.value)} title="Company = plan-tier company-wide · Product/Vertical = scoped · Individual = team member's allocation">
          <option value="All">All Target Types</option>
          <option>Company</option>
          <option>Vertical</option>
          <option>Product</option>
          <option>Individual</option>
        </select>
        <select className="filter-select" value={sourceF} onChange={e => setSourceF(e.target.value)} title="Restrict achievement to deals a given department originated">
          <option value="All">Any Source</option>
          {CONTRIB_SOURCES.map(src => <option key={src}>{src}</option>)}
        </select>
        {(fyF !== "All" || periodF !== "All" || productF !== "All" || teamF !== "All" || verticalF !== "All" || salesF !== "All" || typeF !== "All" || sourceF !== "All") && (
          <button className="btn btn-sec btn-xs" onClick={() => { setFyF("All"); setPeriodF("All"); setProductF("All"); setTeamF("All"); setVerticalF("All"); setSalesF("All"); setTypeF("All"); setSourceF("All"); }}>Clear</button>
        )}
      </div>

      <div className="card" style={{padding:0}}>
        {filtered.length === 0 ? (
          <Empty icon={<Target size={22}/>} title="No targets set" sub="Define targets for your sales team.">
            <button className="btn btn-primary" style={{marginTop:12}} onClick={() => openAdd()}><Plus size={14}/>Add First Target</button>
          </Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Salesperson</th>
                <th>Line Manager</th>
                <th>Period</th>
                <th>Vertical</th>
                <th>Product</th>
                <th style={{textAlign:"right"}}>Target</th>
                <th style={{textAlign:"right"}}>Achieved</th>
                <th>Achievement</th>
                <th style={{textAlign:"right"}}>Gap</th>
                <th style={{textAlign:"right"}} title="This salesperson's open deals matching the target's period and product">Pipeline</th>
                <th>Deals (T/A)</th>
                <th>Calls (T/A)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map(t => {
                const pct = t.targetValue > 0 ? ((t.achievedValue / t.targetValue) * 100).toFixed(0) : 0;
                const dealPct = t.targetDeals > 0 ? ((t.achievedDeals / t.targetDeals) * 100).toFixed(0) : 0;
                return (
                  <tr key={t.id}>
                    <td>
                      <UserPill uid={t.userId}/>
                      {dupKeys.has(keyOf(t)) && (
                        <span title="Another target covers the same salesperson, period and product. Both claim the same won deals."
                          style={{marginLeft:6, fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:4, color:"#92400E", background:"#F59E0B22", verticalAlign:"middle"}}>
                          duplicate
                        </span>
                      )}
                    </td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{managerOf(t.userId) || "—"}</td>
                    <td style={{fontSize:12.5,fontWeight:600}}>{t.period}</td>
                    <td style={{fontSize:11,color:"var(--text3)"}}>{t.vertical || "—"}</td>
                    <td style={{fontSize:12}}>
                      {t.product === "All" || !t.product
                        ? <span style={{color:"var(--text3)"}}>All Products</span>
                        : <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,color:"#1E40AF",background:"#1E40AF18"}}>{PROD_MAP[t.product]?.name || t.product}</span>}
                    </td>
                    <td style={{textAlign:"right",fontFamily:"'Outfit',sans-serif",fontWeight:700}}>{fmt.inr(t.targetValue)}</td>
                    <td style={{textAlign:"right",fontFamily:"'Outfit',sans-serif",color:pctColor(+pct)}}>{fmt.inr(t.achievedValue)}</td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:60,height:6,background:"#E2E8F0",borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:pctColor(+pct),borderRadius:3}}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:pctColor(+pct)}}>{pct}%</span>
                        {+pct >= 100 ? <TrendingUp size={13} style={{color:"#22C55E"}}/> : <TrendingDown size={13} style={{color:pctColor(+pct)}}/>}
                      </div>
                    </td>
                    <td style={{textAlign:"right",fontSize:12,color:(t.targetValue - t.achievedValue) > 0 ? "var(--red)" : "var(--green)"}}>{fmt.inr(Math.abs(+(t.targetValue - t.achievedValue).toFixed(2)))}</td>
                    <td style={{textAlign:"right",fontSize:12,color:"var(--brand)"}}>{(() => {
                      const pv = +openDeals.filter(d => d.owner === t.userId && (d.per === t.period || !d.per) && prodMatches(t.product, d.products)).reduce((acc, d) => acc + d.value, 0).toFixed(2);
                      return pv ? fmt.inr(pv) : <span style={{color:"var(--text3)"}}>—</span>;
                    })()}</td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{t.targetDeals}/{t.achievedDeals} <span style={{fontSize:10}}>({dealPct}%)</span></td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{t.targetCalls}/{t.achievedCalls}</td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        {canWrite && <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(t)}><Edit2 size={14}/></button>}
                        {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(t.id)}><Trash2 size={14}/></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtered.length > 0 && <Pagination {...pg}/>}
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "Add Target" : "Edit Target"} onClose={() => { setModal(null); setFormErrors({}); setForm(BLANK_TARGET); }} lg
          footer={<>
            <button className="btn btn-sec" onClick={() => { setModal(null); setFormErrors({}); setForm(BLANK_TARGET); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button>
          </>}>
          <div className="form-row">
            <div className="form-group"><label>Salesperson *</label>
              <select value={form.userId} onChange={e => {setForm(f => ({...f, userId: e.target.value})); setFormErrors(e => ({...e, userId: undefined}));}}>
                {userOpts.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <FormError error={formErrors.userId}/>
            </div>
            <div className="form-group"><label>Period *</label>
              <select value={form.period} onChange={e => {setForm(f => ({...f, period: e.target.value})); setFormErrors(e => ({...e, period: undefined}));}}
                style={formErrors.period ? {borderColor:"#DC2626"} : {}}>
                {[...new Set([form.period, ...periodOptions].filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <FormError error={formErrors.period}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Product Focus</label>
              <select value={form.product} onChange={e => setForm(f => ({...f, product: e.target.value}))}>
                <option value="All">All Products</option>
                {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Vertical</label>
              <select value={form.vertical || ""} onChange={e => setForm(f => ({...f, vertical: e.target.value}))}>
                <option value="">— None —</option>
                {verticals.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
          </div>
          {(() => {
            const a = computeAchievement(form);
            const ro = { padding: "8px 10px", background: "var(--s2)", borderRadius: 6, fontWeight: 700, fontFamily: "'Outfit',sans-serif" };
            const note = { fontSize: 10, color: "var(--text3)", marginTop: 2 };
            return (
              <>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginTop:14,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  REVENUE TARGET <span style={{fontWeight:400,textTransform:"none"}}>· achieved is auto-calculated from won deals & call reports for {form.period || "the period"}</span>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Target Value (₹L) *</label>
                    <input type="number" min={0} step={1} value={form.targetValue} onChange={e => setForm(f => ({...f, targetValue: +e.target.value}))}/>
                    <FormError error={formErrors.targetValue}/>
                  </div>
                  <div className="form-group"><label>Achieved (auto)</label>
                    <div style={ro}>₹{a.achievedValue}L</div>
                    <div style={note}>{a.achievedDeals} won deal{a.achievedDeals===1?"":"s"} in {form.period||"period"}</div>
                  </div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginTop:14,marginBottom:8}}>ACTIVITY TARGETS</div>
                <div className="form-row">
                  <div className="form-group"><label>Target Deals</label>
                    <input type="number" min={0} value={form.targetDeals} onChange={e => setForm(f => ({...f, targetDeals: +e.target.value}))}/>
                  </div>
                  <div className="form-group"><label>Achieved Deals (auto)</label>
                    <div style={ro}>{a.achievedDeals}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Target Calls</label>
                    <input type="number" min={0} value={form.targetCalls} onChange={e => setForm(f => ({...f, targetCalls: +e.target.value}))}/>
                  </div>
                  <div className="form-group"><label>Achieved Calls (auto)</label>
                    <div style={ro}>{a.achievedCalls}</div>
                  </div>
                </div>
              </>
            );
          })()}
        </Modal>
      )}

      {/* Per-owner goals editor: the commitments credited to one ABP owner,
          editable in place. Team members' targets appear on their MANAGER's
          list (that's where they credit); the consolidated VP row edits only
          the VP's own slice — allocations are edited on each Line Manager. */}
      {goalsFor && (() => {
        const r = byManager.find(x => x.mgrId === goalsFor);
        if (!r) return null;
        const rows = [...(r.targetRows || [])].sort((a, b) =>
          (b.period || "").localeCompare(a.period || "") || (a.userId || "").localeCompare(b.userId || ""));
        return (
          <Modal title={`Goals — ${userName(goalsFor)}`} onClose={() => setGoalsFor(null)} lg
            footer={<>
              <button className="btn btn-sec" onClick={() => setGoalsFor(null)}><X size={14}/>Close</button>
              <button className="btn btn-primary" onClick={() => { setGoalsFor(null); openAdd(goalsFor); }}><Plus size={14}/>Add Goal</button>
            </>}>
            <div style={{fontSize:11, color:"var(--text3)", marginBottom:8}}>
              Commitments credited to this owner{r.consolidated ? " — their own slice only; team allocations are edited on each Line Manager's row" : " (their team's targets roll up here)"}. Total {fmt.inr(+rows.reduce((acc2, t) => acc2 + (Number(t.targetValue) || 0), 0).toFixed(2))}.
            </div>
            {rows.length === 0 ? (
              <Empty icon={<Target size={20}/>} title="No goals yet" sub="Add the first commitment for this owner."/>
            ) : (
              <table className="tbl">
                <thead><tr><th>Salesperson</th><th>Period</th><th>Product</th><th>Vertical</th>
                  <th style={{textAlign:"right"}}>Target</th><th style={{textAlign:"right"}}>Achieved</th>
                  <th style={{textAlign:"right"}}>Deals</th><th style={{textAlign:"right"}}>Calls</th><th></th></tr></thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.id}>
                      <td><UserPill uid={t.userId}/></td>
                      <td style={{fontSize:12, fontWeight:600}}>{t.period}</td>
                      <td style={{fontSize:11}}>{!t.product || t.product === "All" ? <span style={{color:"var(--text3)"}}>All Products</span> : (PROD_MAP[t.product]?.name || t.product)}</td>
                      <td style={{fontSize:11, color:"var(--text3)"}}>{t.vertical || "—"}</td>
                      <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", fontWeight:700}}>{fmt.inr(t.targetValue)}</td>
                      <td style={{textAlign:"right", fontSize:12, color:"var(--text2)"}}>{fmt.inr(t.achievedValue)}</td>
                      <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{t.targetDeals}/{t.achievedDeals}</td>
                      <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{t.targetCalls}/{t.achievedCalls}</td>
                      <td style={{textAlign:"right"}}>
                        <div style={{display:"flex", gap:4, justifyContent:"flex-end"}}>
                          <button className="icon-btn" aria-label="Edit" onClick={() => { setGoalsFor(null); openEdit(t); }}><Edit2 size={14}/></button>
                          {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => { setGoalsFor(null); setConfirm(t.id); }}><Trash2 size={14}/></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Modal>
        );
      })()}

      {/* Drill-down: the deals behind a number. Live opportunity rows — no
          synthesised data. */}
      {drill && (
        <Modal title={drill.title} onClose={() => setDrill(null)} lg
          footer={<button className="btn btn-sec" onClick={() => setDrill(null)}><X size={14}/>Close</button>}>
          <table className="tbl">
            <thead><tr><th>Deal</th><th>Salesperson</th><th>Products</th><th>Origin</th><th>Closed</th><th style={{textAlign:"right"}}>Value</th></tr></thead>
            <tbody>
              {drill.deals.map(d => (
                <tr key={d.id}>
                  <td style={{fontSize:12,fontWeight:600}}>{d.title}</td>
                  <td><UserPill uid={d.owner}/></td>
                  <td style={{fontSize:11}}>{d.products.length ? d.products.map(pid => PROD_MAP[pid]?.name || pid).join(", ") : "—"}</td>
                  <td style={{fontSize:11,color:"var(--text3)"}}>{d.origin}</td>
                  <td style={{fontSize:12}}>{fmt.date(d.closeDate)}</td>
                  <td style={{textAlign:"right",fontFamily:"'Outfit',sans-serif",fontWeight:700}}>{fmt.inr(d.value)}</td>
                </tr>
              ))}
              <tr style={{borderTop:"2px solid var(--border)"}}>
                <td colSpan={5} style={{fontWeight:700,fontSize:12}}>Total — {drill.deals.length} deal{drill.deals.length === 1 ? "" : "s"}, each counted once</td>
                <td style={{textAlign:"right",fontFamily:"'Outfit',sans-serif",fontWeight:800}}>{fmt.inr(+drill.deals.reduce((acc, d) => acc + d.value, 0).toFixed(2))}</td>
              </tr>
            </tbody>
          </table>
        </Modal>
      )}

      {confirm && <Confirm title="Delete Target" msg="Remove this target entry?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}
    </div>
  );
}

export default Targets;

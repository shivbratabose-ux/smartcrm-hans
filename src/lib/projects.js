// Which business is run as a delivery PROJECT (decisions 21 Nov 2026):
//   • deals of ₹50 lakh or more, always;
//   • any other deal or lead someone ticks "Run as a project" on (Pipeline /
//     Leads), or a project added by hand — project.selected = true.
// Smaller wins nobody ticked are delivered from the deal itself and stay off
// the Projects screen (their records are kept, not deleted). The ₹50L line is
// also the dashboard's "strategic book".
// Pure — tested in scripts/test-projects.mjs.

export const PROJECT_MIN_LAKH = 50;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v) => v != null && v !== "";

/** Is a deal value (₹ lakh) large enough to be run as a project? */
export const isProjectSize = (lakh) => n(lakh) >= PROJECT_MIN_LAKH;

/**
 * A project's value in ₹ lakh: its deal's value when it has one (the deal is
 * the record of what was sold, and some projects carry a value typed in rupees
 * by mistake), else its lead's estimated value, else the project's own value.
 */
export function projectValue(project, opps = [], leads = []) {
  const opp = project?.oppId ? (opps || []).find((o) => o && o.id === project.oppId && !o.isDeleted) : null;
  if (opp && has(opp.value)) return n(opp.value);
  const lead = project?.leadId ? (leads || []).find((l) => l && l.id === project.leadId && !l.isDeleted) : null;
  if (lead && has(lead.estimatedValue) && n(lead.estimatedValue) > 0) return n(lead.estimatedValue);
  return n(project?.value);
}

/** Is this project on the Projects screen? ₹50L or more, or chosen. */
export const isShownProject = (p, opps = [], leads = []) => !!p?.selected || isProjectSize(projectValue(p, opps, leads));

/** Split projects into those shown on the Projects screen and the rest. */
export function splitProjects(projects = [], opps = [], leads = []) {
  const shown = [], smaller = [];
  for (const p of projects || []) (isShownProject(p, opps, leads) ? shown : smaller).push(p);
  return { shown, smaller };
}

/** The live project of a deal ("opp") or lead ("lead"), if any. */
export function linkedProject(projects = [], kind, id) {
  if (!id) return null;
  const key = kind === "lead" ? "leadId" : "oppId";
  return (projects || []).find((p) => p && !p.isDeleted && p[key] === id) || null;
}

/** Next PRJ-YYYY-NNN number after the highest in use. */
export function nextProjectNumber(projects = [], year) {
  const seq = (projects || []).reduce((m, p) => { const x = String(p?.projectNo || "").match(/PRJ-\d{4}-(\d+)/); return x ? Math.max(m, +x[1]) : m; }, 0) + 1;
  return `PRJ-${year}-${String(seq).padStart(3, "0")}`;
}

const base = (o) => ({
  contractId: "", status: "Requirement Gathering", progress: 0, goLiveActual: "",
  deliverables: "", risks: "", milestones: [], ...o,
});

/** A delivery project for a deal (won, or ticked "Run as a project"). */
export function projectFromOpp(opp, { id, projectNo, today, selected = false, note = "" } = {}) {
  return base({
    id, projectNo, name: opp.title || "New Project", accountId: opp.accountId || "", oppId: opp.id, leadId: "",
    owner: opp.owner, products: Array.isArray(opp.products) ? [...opp.products] : [],
    startDate: today, goLiveTarget: opp.decisionDate || opp.closeDate || "",
    value: n(opp.value), scope: opp.notes || "",
    notes: note || (opp.isTender ? `From tender ${opp.tenderNo || ""} (${opp.tenderAuthority || ""}).` : "Auto-created from won deal."),
    team: [{ userId: opp.owner, role: "Delivery Lead" }], createdDate: today, selected: !!selected,
  });
}

/** A delivery project for a lead ticked "Run as a project". */
export function projectFromLead(lead, { id, projectNo, today, productName = "" } = {}) {
  const owner = lead.assignedTo || lead.owner || "";
  const products = [...new Set([lead.product, ...(lead.additionalProducts || [])].filter(Boolean))];
  return base({
    id, projectNo, name: [productName || lead.product, lead.company].filter(Boolean).join(" – ") || "New Project",
    accountId: lead.accountId || "", oppId: "", leadId: lead.id, owner, products,
    startDate: today, goLiveTarget: lead.expectedCloseDate || "",
    value: n(lead.estimatedValue), scope: lead.notes || lead.remarks || "",
    notes: "Added to Projects from the lead.", team: owner ? [{ userId: owner, role: "Delivery Lead" }] : [],
    createdDate: today, selected: true,
  });
}

/**
 * Tick / untick "Run as a project" on a deal or lead. Ticking reuses the
 * record's project if it has one (e.g. a small win's hidden project) or adds
 * one; unticking only takes it off the Projects screen (selected = false):
 * nothing is deleted. Returns the new projects list.
 * opts: { today, id (for a new project), productName (lead) }
 */
export function setProjectChoice(projects = [], kind, record, on, opts = {}) {
  const list = projects || [];
  const existing = linkedProject(list, kind, record?.id);
  if (existing) return list.map((p) => (p === existing ? { ...p, selected: !!on } : p));
  if (!on || !record?.id) return list;
  const today = opts.today || "";
  const projectNo = nextProjectNumber(list, Number(String(today).slice(0, 4)) || new Date().getFullYear());
  const fresh = kind === "lead"
    ? projectFromLead(record, { id: opts.id, projectNo, today, productName: opts.productName })
    : projectFromOpp(record, { id: opts.id, projectNo, today, selected: true, note: "Added to Projects from the deal." });
  return [...list, fresh];
}

// Which won business is run as a delivery PROJECT (decision 21 Nov 2026):
// only deals of ₹50 lakh or more. Smaller wins are delivered from the deal
// itself (Pipeline / Leads) and do not get a project. The same line marks the
// "strategic book" on the management dashboard.
// Pure — tested in scripts/test-projects.mjs.

export const PROJECT_MIN_LAKH = 50;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Is a deal value (₹ lakh) large enough to be run as a project? */
export const isProjectSize = (lakh) => n(lakh) >= PROJECT_MIN_LAKH;

/**
 * A project's value in ₹ lakh: its deal's value when it has one (the deal is
 * the record of what was sold, and some projects carry a value typed in rupees
 * by mistake), else the project's own value.
 */
export function projectValue(project, opps = []) {
  const opp = project?.oppId ? (opps || []).find((o) => o && o.id === project.oppId && !o.isDeleted) : null;
  return opp && opp.value != null && opp.value !== "" ? n(opp.value) : n(project?.value);
}

/** Split projects into those shown on the Projects screen and the smaller ones. */
export function splitProjects(projects = [], opps = []) {
  const shown = [], smaller = [];
  for (const p of projects || []) (isProjectSize(projectValue(p, opps)) ? shown : smaller).push(p);
  return { shown, smaller };
}

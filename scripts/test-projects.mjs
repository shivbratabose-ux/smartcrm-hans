// Projects are only deals of ₹50 lakh or more (decision 21 Nov 2026).
// Run: node scripts/test-projects.mjs
import { PROJECT_MIN_LAKH, isProjectSize, projectValue, splitProjects, setProjectChoice, linkedProject, nextProjectNumber, projectFromOpp } from "../src/lib/projects.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};

check("the line is ₹50 lakh", PROJECT_MIN_LAKH, 50);
check("₹50L and above are projects; below are not", [isProjectSize(50), isProjectSize(120), isProjectSize(49.99), isProjectSize(0), isProjectSize(null), isProjectSize("75")], [true, true, false, false, false, true]);

const opps = [{ id: "o1", value: 0.2 }, { id: "o2", value: 80 }, { id: "o3", value: 6, isDeleted: true }];
check("the deal's value wins over a project value typed in rupees by mistake", projectValue({ oppId: "o1", value: 20000 }, opps), 0.2);
check("a project without a deal keeps its own value", projectValue({ value: 65 }, opps), 65);
check("a deleted deal does not count; the project's own value is used", projectValue({ oppId: "o3", value: 600000 }, opps), 600000);

const { shown, smaller } = splitProjects([
  { id: "p1", oppId: "o1", value: 20000 },   // ₹0.2L deal — not a project
  { id: "p2", oppId: "o2", value: 0 },       // ₹80L deal — a project
  { id: "p3", value: 36 },                   // ₹36L — not a project
  { id: "p4", value: 50 },                   // exactly ₹50L — a project
], opps);
check("shown: the ₹80L and ₹50L ones", shown.map((p) => p.id), ["p2", "p4"]);
check("smaller: the rest, kept (not deleted)", smaller.map((p) => p.id), ["p1", "p3"]);

console.log("\nRun as a project (tick-box on a deal or lead)");
const deal = { id: "o9", title: "iCAFFE – SMALL CO", value: 3, owner: "u1", accountId: "a1", products: ["iCAFFE"], closeDate: "2026-12-31" };
const lead = { id: "l9", company: "POC CO", product: "WiseCCS", assignedTo: "u2", estimatedValue: 12, accountId: "a2" };
const start = [{ id: "p_old", projectNo: "PRJ-2026-050", oppId: "o1", value: 20000 }];
const ticked = setProjectChoice(start, "opp", deal, true, { today: "2026-11-21", id: "p_new" });
const pNew = linkedProject(ticked, "opp", "o9");
check("ticking a small deal adds a chosen project with the next number", [ticked.length, pNew.projectNo, pNew.selected, pNew.value, pNew.accountId, pNew.notes], [2, "PRJ-2026-051", true, 3, "a1", "Added to Projects from the deal."]);
check("…and it is on the Projects screen though under ₹50L", splitProjects(ticked, [deal, ...opps]).shown.map((p) => p.id), ["p_new"]);
const unticked = setProjectChoice(ticked, "opp", deal, false, { today: "2026-11-21" });
check("unticking keeps the project, just off the screen", [unticked.length, linkedProject(unticked, "opp", "o9").selected, splitProjects(unticked, [deal, ...opps]).shown.length], [2, false, 0]);
check("ticking a deal that already has a (hidden) project reuses it", setProjectChoice(start, "opp", { id: "o1", value: 0.2 }, true, { today: "2026-11-21", id: "x" }).map((p) => [p.id, p.selected]), [["p_old", true]]);
check("unticking a record with no project changes nothing", setProjectChoice(start, "opp", deal, false, {}) === start, true);
const fromLead = setProjectChoice([], "lead", lead, true, { today: "2026-11-21", id: "p_l", productName: "WiseCCS" });
check("a lead becomes a project linked by lead, valued at its estimate", [fromLead[0].name, fromLead[0].leadId, fromLead[0].oppId, fromLead[0].owner, projectValue(fromLead[0], [], [lead]), fromLead[0].projectNo], ["WiseCCS – POC CO", "l9", "", "u2", 12, "PRJ-2026-001"]);
check("numbering", [nextProjectNumber([], 2027), nextProjectNumber([{ projectNo: "PRJ-2026-042" }, { projectNo: "PRJ-2026-042" }], 2026)], ["PRJ-2027-001", "PRJ-2026-043"]);
check("a won ₹50L+ deal's automatic project", (({ name, value, selected, notes, status }) => ({ name, value, selected, notes, status }))(projectFromOpp({ id: "o5", title: "WiseCCS – AISATS", value: 120, owner: "u1" }, { id: "p5", projectNo: "PRJ-2026-060", today: "2026-11-21" })),
  { name: "WiseCCS – AISATS", value: 120, selected: false, notes: "Auto-created from won deal.", status: "Requirement Gathering" });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

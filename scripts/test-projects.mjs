// Projects are only deals of ₹50 lakh or more (decision 21 Nov 2026).
// Run: node scripts/test-projects.mjs
import { PROJECT_MIN_LAKH, isProjectSize, projectValue, splitProjects } from "../src/lib/projects.js";

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

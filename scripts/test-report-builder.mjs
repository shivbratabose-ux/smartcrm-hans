// ═══════════════════════════════════════════════════════════════════
// test-report-builder.mjs — Reports → Custom Reports engine
// (src/lib/reportBuilder.js): mix a main table with linked tables.
// ═══════════════════════════════════════════════════════════════════
import { runReport, columnOptions, resolveColumn, toCSV, bucketOf, measure, STARTER_REPORTS, STARTER_CATEGORIES, SOURCES, RELATIONS } from "../src/lib/reportBuilder.js";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name); } };

const data = {
  accounts: [{ id: "a1", name: "Acme", country: "India", owner: "u1" }, { id: "a2", name: "Beta", country: "UAE", owner: "u2" }],
  opps: [
    { id: "o1", oppNo: "OPP-1", title: "Acme ERP", accountId: "a1", stage: "Proposal", value: 40, owner: "u1", closeDate: "2026-12-15" },
    { id: "o2", oppNo: "OPP-2", title: "Beta Cargo", accountId: "a2", stage: "Won", value: 25, owner: "u2", closeDate: "2026-10-02" },
    { id: "o3", oppNo: "OPP-3", title: "Acme AMS", accountId: "a1", stage: "Demo", value: 10, owner: "u1", closeDate: "2026-11-30" },
    { id: "o4", oppNo: "OPP-4", title: "Deleted", accountId: "a1", stage: "Demo", value: 99, owner: "u1", isDeleted: true },
  ],
  callReports: [
    { id: "c1", oppId: "o1", accountId: "a1", callDate: "2026-11-02", marketingPerson: "u1", duration: 20 },
    { id: "c2", oppId: "o1", accountId: "a1", callDate: "2026-11-18", marketingPerson: "u3", duration: 10 },
    { id: "c3", oppId: "o2", accountId: "a2", callDate: "2026-09-10", marketingPerson: "u2", duration: 30 },
    { id: "c4", oppId: "o1", accountId: "a1", callDate: "2026-11-19", marketingPerson: "u1", isDeleted: true },
  ],
  activities: [
    { id: "x1", oppId: "o1", accountId: "a1", date: "2026-11-05", type: "Meeting", files: [{ id: "f9", name: "MoM.pdf" }] },
    { id: "x2", oppId: "o3", accountId: "a1", date: "2026-11-20", type: "Call" },
  ],
  quotes: [{ id: "q1", oppId: "o1", accountId: "a1", total: 160480, status: "Accepted" }, { id: "q2", oppId: "o1", accountId: "a1", total: 100000, status: "Draft" }],
  contracts: [], collections: [], tickets: [{ id: "t1", accountId: "a1" }], leads: [], contacts: [],
  files: [{ id: "f1", name: "RFP.pdf", linkedTo: [{ type: "opp", id: "o1" }] }, { id: "f2", name: "Deck.pdf", linkedTo: [{ type: "opp", id: "o2" }] }],
  notes: [{ id: "n1", recordType: "opp", recordId: "o1", date: "2026-11-01" }],
};
const users = { u1: "Ravi", u2: "Meera", u3: "Arjun" };
const ctx = { today: "2026-11-21", userName: id => users[id] || id, accountName: id => data.accounts.find(a => a.id === id)?.name || id };

// The user's example: opp ID with opp details + number of calls, activities and documents per opp.
const r = runReport({ source: "opps",
  columns: ["f:oppNo", "f:title", "f:accountId", "f:stage", "a:calls:count", "a:activities:count", "a:documents:count", "a:calls:latest:callDate", "a:quotes:sum:total", "l:account:country"],
  sort: { col: "f:oppNo", dir: "asc" } }, data, ctx);
const o1 = r.rows.find(x => x.rec.id === "o1");
ok("one row per live opp (deleted left out)", r.total === 3);
ok("calls per opp counted (deleted call ignored)", o1.values["a:calls:count"] === 2);
ok("activities per opp counted", o1.values["a:activities:count"] === 1);
ok("documents = opp files + files on its activities", o1.values["a:documents:count"] === 2);
ok("latest call date", o1.shown["a:calls:latest:callDate"] === "18 Nov 2026");
ok("sum over linked quotes", o1.values["a:quotes:sum:total"] === 260480);
ok("lookup into the linked account", o1.shown["l:account:country"] === "India");
ok("account shown by name, not id", o1.shown["f:accountId"] === "Acme");
ok("opp with nothing linked shows 0", r.rows.find(x => x.rec.id === "o3").values["a:calls:count"] === 0);

// Filters
const f1 = runReport({ source: "opps", columns: ["f:oppNo", "f:stage"], filters: [{ col: "f:stage", op: "none", value: "Won, Lost" }] }, data, ctx);
ok("'is none of' removes Won", f1.total === 2 && !f1.rows.some(x => x.rec.stage === "Won"));
const f2 = runReport({ source: "opps", columns: ["f:oppNo"], filters: [{ col: "a:calls:count", op: "gte", value: "1" }] }, data, ctx);
ok("filter on a linked count (not even shown)", f2.total === 2);
const f3 = runReport({ source: "opps", columns: ["f:oppNo"], filters: [{ col: "f:owner", op: "is", value: "ravi" }] }, data, ctx);
ok("user filter matches by name", f3.total === 2);
const f4 = runReport({ source: "opps", columns: ["f:oppNo"], filters: [{ col: "f:closeDate", op: "nextDays", value: "10" }] }, data, ctx);
ok("next 10 days date filter", f4.total === 1 && f4.rows[0].rec.id === "o3");
const f5 = runReport({ source: "opps", columns: ["f:oppNo"], filters: [{ col: "f:stage", op: "is", value: "" }] }, data, ctx);
ok("half-filled filter is ignored", f5.total === 3);

// Grouping
const g = runReport({ source: "opps", columns: ["f:oppNo", "f:value"], groupBy: { col: "f:accountId" } }, data, ctx);
const acme = g.groups.find(x => x.label === "Acme");
ok("group by account: count and sum", acme.count === 2 && acme.sums["f:value"] === 50);
const gm = runReport({ source: "callReports", columns: ["f:callDate"], groupBy: { col: "f:callDate", by: "month" } }, data, ctx);
ok("group calls by month, in date order", JSON.stringify(gm.groups.map(x => [x.label, x.count])) === JSON.stringify([["Sep 2026", 1], ["Nov 2026", 2]]));
ok("Indian FY quarters", bucketOf("2026-04-10", "quarter") === "FY27 Q1" && bucketOf("2027-02-01", "quarter") === "FY27 Q4" && bucketOf("2026-03-31", "fy") === "FY 2025-26");
const gl = runReport({ source: "opps", columns: ["f:oppNo", "a:calls:list:marketingPerson"], groupBy: { col: "a:calls:list:marketingPerson" } }, data, ctx);
ok("group by a list column counts each person", gl.groups.find(x => x.label === "Ravi").count === 1 && gl.groups.find(x => x.label === "Arjun").count === 1);

// Page filters (period / team / owner) apply to the main table
const k = runReport({ source: "opps", columns: ["f:oppNo"] }, data, { ...ctx, keep: rec => rec.owner === "u1" });
ok("keep() narrows the main table", k.total === 2);

// Sorting
const s = runReport({ source: "opps", columns: ["f:oppNo", "f:value"], sort: { col: "f:value", dir: "desc" } }, data, ctx);
ok("sort by number desc", s.rows.map(x => x.rec.id).join() === "o1,o2,o3");

// CSV
const csv = toCSV(runReport({ source: "opps", columns: ["f:oppNo", "f:title", "a:calls:count"], sort: { col: "f:oppNo" } }, data, ctx));
ok("CSV header + rows", csv.split("\n")[0] === "Opp ID,Title,Calls › Count" && csv.split("\n")[1] === "OPP-1,Acme ERP,2");

// Catalogue integrity: every option resolves, every starter runs.
let bad = [];
for (const src of Object.keys(SOURCES)) for (const g of columnOptions(src)) for (const o of g.options) if (!resolveColumn(src, o.id)) bad.push(`${src}:${o.id}`);
ok("every column option resolves", bad.length === 0);
for (const rel of Object.values(RELATIONS).flatMap(Object.values)) if (rel.of && !SOURCES[rel.of]) bad.push(rel.label);
ok("every link points at a real table", bad.length === 0);
const broken = STARTER_REPORTS.filter(sp => { const res = runReport(sp, data, ctx); return res.error || res.columns.length !== sp.columns.length; });
ok("every starter report runs with all its columns", broken.length === 0);
const refs = STARTER_REPORTS.flatMap(sp => [
  ...(sp.filters || []).map(f => f.col), sp.groupBy?.col, sp.groupBy2?.col, sp.sort?.col, sp.chartValue === "count" ? "" : sp.chartValue,
].filter(Boolean).filter(id => !resolveColumn(sp.source, id)).map(id => `${sp.id}:${id}`));
ok("every starter's filters, groupings, sort and chart value resolve", refs.length === 0 || (console.log(refs), false));
ok("chart values of starters are numeric columns in the report", STARTER_REPORTS.every(sp => sp.chartValue === "count" || (sp.columns.includes(sp.chartValue) && resolveColumn(sp.source, sp.chartValue).type === "num")));
ok("starter ids are unique", new Set(STARTER_REPORTS.map(s => s.id)).size === STARTER_REPORTS.length);
ok("every starter has a known category", STARTER_REPORTS.every(s => STARTER_CATEGORIES.includes(s.category)));

// ── Calculated fields (need won / lost from the stage masters) ──
const cctx = { ...ctx, isWon: o => o.stage === "Won", isLost: o => o.stage === "Lost" };
const opps2 = { ...data, opps: [
  { id: "p1", oppNo: "P1", stage: "Won", value: 20, probability: 100, owner: "u1", createdDate: "2026-09-01", closeDate: "2026-10-01" },
  { id: "p2", oppNo: "P2", stage: "Won", value: 30, probability: 100, owner: "u1", createdDate: "2026-10-01", closeDate: "2026-10-21" },
  { id: "p3", oppNo: "P3", stage: "Proposal", value: 40, probability: 25, owner: "u2", createdDate: "2026-11-01", closeDate: "2026-11-30" },
  { id: "p4", oppNo: "P4", stage: "Lost", value: 10, probability: 0, owner: "u2", createdDate: "2026-08-01", closeDate: "2026-09-15" },
] };
const calc = runReport({ source: "opps", columns: ["f:oppNo", "f:status", "f:weighted", "f:cycleDays", "f:daysToClose"], sort: { col: "f:oppNo" } }, opps2, cctx);
const byNo = Object.fromEntries(calc.rows.map(r => [r.rec.oppNo, r.values]));
ok("deal status Open / Won / Lost", byNo.P1["f:status"] === "Won" && byNo.P3["f:status"] === "Open" && byNo.P4["f:status"] === "Lost");
ok("weighted value = value × probability", byNo.P3["f:weighted"] === 10);
ok("sales cycle days for won deals only", byNo.P1["f:cycleDays"] === 30 && byNo.P3["f:cycleDays"] === "");
ok("days to close for open deals", byNo.P3["f:daysToClose"] === 9);
const cyc = runReport({ source: "opps", columns: ["f:oppNo", "f:value", "f:cycleDays"], filters: [{ col: "f:status", op: "is", value: "Won" }], groupBy: { col: "f:owner" } }, opps2, cctx);
const u1 = cyc.groups.find(g => g.label === "Ravi");
ok("group averages day columns, sums money", measure(u1, resolveColumn("opps", "f:cycleDays")) === 25 && measure(u1, resolveColumn("opps", "f:value")) === 50 && measure(u1, "count") === 2);

// ── Matrix (two-way) grouping ──
const mx = runReport({ source: "opps", columns: ["f:oppNo", "f:value"], groupBy: { col: "f:owner" }, groupBy2: { col: "f:status" } }, opps2, cctx);
const ravi = mx.groups.find(g => g.label === "Ravi"), meera = mx.groups.find(g => g.label === "Meera");
ok("matrix rows × columns", mx.groups2.map(g => g.label).sort().join() === "Lost,Open,Won" && ravi.cells.Won.count === 2 && meera.cells.Open.count === 1 && meera.cells.Lost.count === 1);
ok("matrix cell sums", ravi.cells.Won.sums["f:value"] === 50 && !ravi.cells.Lost);

// ── Relative date filters (today = 21 Nov 2026) ──
const dates = { ...data, opps: ["2026-11-21", "2026-11-03", "2026-10-15", "2026-04-02", "2026-03-31"].map((d, i) => ({ id: `d${i}`, oppNo: `D${i}`, closeDate: d })) };
const n = (op, value = "") => runReport({ source: "opps", columns: ["f:oppNo"], filters: [{ col: "f:closeDate", op, value }] }, dates, ctx).total;
ok("today / this month / last month", n("today") === 1 && n("thisMonth") === 2 && n("lastMonth") === 1);
ok("this FY quarter (Oct–Dec) and this FY (from 1 Apr)", n("thisQuarter") === 3 && n("thisFY") === 4);
ok("more than N days ago, or never", runReport({ source: "opps", columns: ["f:oppNo"], filters: [{ col: "a:calls:latest:callDate", op: "olderThanDays", value: "10" }] }, data, ctx).total === 2);

// ── Collections ageing band ──
const coll = { ...data, collections: [
  { id: "k1", pendingAmount: 100, dueDate: "2026-11-30" }, { id: "k2", pendingAmount: 100, dueDate: "2026-11-01" },
  { id: "k3", pendingAmount: 100, dueDate: "2026-07-01" }, { id: "k4", pendingAmount: 0, dueDate: "2026-01-01" },
] };
const ag = runReport({ source: "collections", columns: ["f:ageingBand", "f:daysOverdue"], sort: { col: "f:daysOverdue", dir: "asc" } }, coll, ctx);
ok("ageing bands", ag.rows.map(r => r.values["f:ageingBand"]).join() === "Not yet due,Paid,1–30 days,90+ days");

console.log(`\nreport builder: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

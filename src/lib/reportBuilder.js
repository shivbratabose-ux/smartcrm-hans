// ─────────────────────────────────────────────────────────────────────
// Custom report builder — the engine behind Reports → Custom Reports.
//
// Pick a MAIN TABLE (one row per record), then mix in columns from any
// linked table:
//   • fields of the main table                     Opp No, Stage, Value…
//   • fields of a linked parent ("lookup")          Account › Country
//   • a measure over linked children ("rollup")     Calls › Count,
//                                                   Activities › Latest date,
//                                                   Quotes › Sum of total…
// then filter, group (by value, or by month / quarter / year for dates),
// sort, chart and export. Pure functions: no React, no storage — tested in
// node by scripts/test-report-builder.mjs.
//
// A report is a plain object (the "spec") so it can be saved and shared:
//   { name, source, columns:[colId…], filters:[{col,op,value}],
//     groupBy:{col,by}, sort:{col,dir}, chart }
// Column ids:  "f:<field>"              main-table field
//              "l:<rel>:<field>"        lookup field on a linked parent
//              "a:<rel>:<fn>[:<field>]" rollup over linked children
// ─────────────────────────────────────────────────────────────────────

// ── Field catalogue per table ───────────────────────────────────────
// type: text | num | date | user | account | list | bool
const F = (key, label, type = "text") => ({ key, label, type });

export const SOURCES = {
  opps: {
    label: "Opportunities", one: "Opportunity", list: "opps", owner: "owner", date: "closeDate",
    fields: [
      F("oppNo", "Opp ID"), F("title", "Title"), F("accountId", "Account", "account"), F("stage", "Stage"),
      F("value", "Value (₹ L)", "num"), F("probability", "Probability %", "num"), F("owner", "Owner", "user"),
      F("closeDate", "Close date", "date"), F("createdDate", "Created", "date"), F("source", "Source"),
      F("lob", "LOB"), F("forecastCat", "Forecast category"), F("dealSize", "Deal size"), F("country", "Country"),
      F("territory", "Territory"), F("products", "Products", "list"), F("nextStep", "Next step"),
      F("competitors", "Competitors"), F("lossReason", "Loss reason"), F("isTender", "Tender", "bool"),
      F("submissionDate", "Tender submission", "date"),
    ],
  },
  accounts: {
    label: "Accounts", one: "Account", list: "accounts", owner: "owner", date: "",
    fields: [
      F("accountNo", "Account No"), F("name", "Name"), F("type", "Type"), F("segment", "Segment"),
      F("status", "Status"), F("owner", "Owner", "user"), F("country", "Country"), F("state", "State"),
      F("city", "City"), F("territory", "Territory"), F("arrRevenue", "ARR", "num"), F("potential", "Potential", "num"),
      F("products", "Products", "list"), F("hierarchyLevel", "Hierarchy level"), F("paymentTerms", "Payment terms"),
    ],
  },
  leads: {
    label: "Leads", one: "Lead", list: "leads", owner: "assignedTo", date: "createdDate",
    fields: [
      F("leadId", "Lead ID"), F("company", "Company"), F("contact", "Contact"), F("stage", "Stage"),
      F("source", "Source"), F("product", "Product"), F("vertical", "Vertical"), F("region", "Region"),
      F("country", "Country"), F("city", "City"), F("assignedTo", "Assigned to", "user"),
      F("createdDate", "Created", "date"), F("nextCall", "Next call", "date"), F("score", "Score", "num"),
      F("temperature", "Temperature"), F("estimatedValue", "Estimated value", "num"),
      F("accountId", "Account", "account"), F("campaignName", "Campaign"),
    ],
  },
  contacts: {
    label: "Contacts", one: "Contact", list: "contacts", owner: "", date: "lastContactDate",
    fields: [
      F("contactId", "Contact ID"), F("name", "Name"), F("designation", "Designation"), F("department", "Department"),
      F("accountId", "Account", "account"), F("email", "Email"), F("phone", "Phone"), F("city", "City"),
      F("country", "Country"), F("decisionLevel", "Decision level"), F("influence", "Influence"),
      F("lastContactDate", "Last contact", "date"), F("source", "Source"),
    ],
  },
  activities: {
    label: "Activities", one: "Activity", list: "activities", owner: "owner", date: "date",
    fields: [
      F("title", "Title"), F("type", "Type"), F("status", "Status"), F("date", "Date", "date"), F("time", "Time"),
      F("duration", "Duration (min)", "num"), F("owner", "Owner", "user"), F("accountId", "Account", "account"),
      F("outcome", "Outcome"),
    ],
  },
  callReports: {
    label: "Call Reports", one: "Call", list: "callReports", owner: "marketingPerson", date: "callDate",
    fields: [
      F("callDate", "Call date", "date"), F("callTime", "Time"), F("company", "Company"), F("leadName", "Lead / contact"),
      F("callType", "Call type"), F("objective", "Objective"), F("outcome", "Outcome"),
      F("marketingPerson", "Logged by", "user"), F("duration", "Duration (min)", "num"),
      F("nextCallDate", "Next call", "date"), F("leadStage", "Lead stage"), F("product", "Product"),
      F("accountId", "Account", "account"),
    ],
  },
  quotes: {
    label: "Quotations", one: "Quote", list: "quotes", owner: "owner", date: "createdDate",
    fields: [
      F("quoteNo", "Quote No"), F("title", "Title"), F("accountId", "Account", "account"), F("status", "Status"),
      F("approvalStatus", "Approval"), F("version", "Version", "num"), F("subtotal", "Subtotal (₹)", "num"),
      F("discount", "Discount", "num"), F("taxAmount", "Tax (₹)", "num"), F("total", "Total (₹)", "num"),
      F("owner", "Owner", "user"), F("createdDate", "Created", "date"), F("sentDate", "Sent", "date"),
      F("acceptedDate", "Accepted", "date"), F("expiryDate", "Expiry", "date"), F("isFinal", "Final", "bool"),
      F("product", "Product"),
    ],
  },
  contracts: {
    label: "Contracts", one: "Contract", list: "contracts", owner: "owner", date: "startDate",
    fields: [
      F("contractNo", "Contract No"), F("title", "Title"), F("accountId", "Account", "account"), F("status", "Status"),
      F("product", "Product"), F("value", "Value", "num"), F("startDate", "Start", "date"), F("endDate", "End", "date"),
      F("renewalDate", "Renewal", "date"), F("billingFrequency", "Billing frequency"),
      F("commercialModel", "Commercial model"), F("owner", "Owner", "user"),
    ],
  },
  collections: {
    label: "Collections", one: "Invoice", list: "collections", owner: "owner", date: "invoiceDate",
    fields: [
      F("invoiceNo", "Invoice No"), F("accountId", "Account", "account"), F("invoiceDate", "Invoice date", "date"),
      F("dueDate", "Due date", "date"), F("billedAmount", "Billed", "num"), F("collectedAmount", "Collected", "num"),
      F("pendingAmount", "Pending", "num"), F("status", "Status"), F("paymentDate", "Paid on", "date"),
      F("product", "Product"), F("owner", "Owner", "user"), F("agingBucket", "Ageing"),
    ],
  },
  tickets: {
    label: "Tickets", one: "Ticket", list: "tickets", owner: "assigned", date: "reportedDate",
    fields: [
      F("ticketNo", "Ticket No"), F("title", "Title"), F("accountId", "Account", "account"), F("product", "Product"),
      F("type", "Type"), F("priority", "Priority"), F("severity", "Severity"), F("status", "Status"),
      F("assigned", "Assigned to", "user"), F("reportedDate", "Reported", "date"),
      F("resolvedDate", "Resolved", "date"), F("csat", "CSAT", "num"), F("category", "Category"),
    ],
  },
};

// Documents and notes aren't main tables, only things you count.
const DOCS = { label: "Documents", fields: [F("name", "Name"), F("date", "Date", "date")] };
const NOTES = { label: "Notes", fields: [F("date", "Date", "date"), F("author", "Author", "user")] };

const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
const linkedFile = (type) => (rec, f) => Array.isArray(f.linkedTo) && f.linkedTo.some(l => l.type === type && l.id === rec.id);
const filesOf = (type, actKey) => (rec, data) => {
  const own = (data.files || []).filter(f => linkedFile(type)(rec, f));
  const fromActs = actKey
    ? (data.activities || []).filter(a => !a.isDeleted && a[actKey] === rec.id).flatMap(a => (a.files || []).map(f => ({ ...f, date: f.date || a.date })))
    : [];
  return [...own, ...fromActs];
};
const notesOf = (type) => (rec, data) => (data.notes || []).filter(n => n.recordType === type && n.recordId === rec.id);

// ── Links between tables ────────────────────────────────────────────
// many: rollups (count / sum / latest…). one: lookups (a parent's fields).
// `rows(rec, data)` returns the linked records; `of` names their table.
const many = (label, of, match) => ({ label, of, kind: "many", rows: (rec, data) => (data[SOURCES[of].list] || []).filter(r => !r.isDeleted && match(rec, r)) });
const custom = (label, def, rows) => ({ label, def, kind: "many", rows });
const one = (label, of, idOf) => ({ label, of, kind: "one", row: (rec, data) => { const id = idOf(rec); return id ? (data[SOURCES[of].list] || []).find(r => r.id === id) || null : null; } });

export const RELATIONS = {
  opps: {
    account:    one("Account", "accounts", o => o.accountId),
    calls:      many("Calls", "callReports", (o, r) => r.oppId === o.id),
    activities: many("Activities", "activities", (o, a) => a.oppId === o.id),
    quotes:     many("Quotes", "quotes", (o, q) => q.oppId === o.id),
    contracts:  many("Contracts", "contracts", (o, c) => c.oppId === o.id),
    documents:  custom("Documents", DOCS, filesOf("opp", "oppId")),
    notes:      custom("Notes", NOTES, notesOf("opp")),
  },
  accounts: {
    opps:        many("Opportunities", "opps", (a, o) => o.accountId === a.id),
    contacts:    many("Contacts", "contacts", (a, c) => c.accountId === a.id),
    leads:       many("Leads", "leads", (a, l) => l.accountId === a.id),
    calls:       many("Calls", "callReports", (a, r) => r.accountId === a.id),
    activities:  many("Activities", "activities", (a, x) => x.accountId === a.id),
    quotes:      many("Quotes", "quotes", (a, q) => q.accountId === a.id),
    contracts:   many("Contracts", "contracts", (a, c) => c.accountId === a.id),
    collections: many("Collections", "collections", (a, c) => c.accountId === a.id),
    tickets:     many("Tickets", "tickets", (a, t) => t.accountId === a.id),
    documents:   custom("Documents", DOCS, filesOf("account", "accountId")),
    notes:       custom("Notes", NOTES, notesOf("account")),
  },
  leads: {
    account: one("Account", "accounts", l => l.accountId),
    calls:   many("Calls", "callReports", (l, r) => r.leadId === l.id),
    opps:    many("Opportunities", "opps", (l, o) => o.leadId === l.id || has(o.sourceLeadIds, l.id) || has(l.convertedOppIds, o.id)),
  },
  contacts: {
    account:    one("Account", "accounts", c => c.accountId),
    calls:      many("Calls", "callReports", (c, r) => r.contactId === c.id || has(r.contactIds, c.id)),
    activities: many("Activities", "activities", (c, a) => a.contactId === c.id),
    opps:       many("Opportunities", "opps", (c, o) => o.primaryContactId === c.id || has(o.secondaryContactIds, c.id)),
  },
  activities: {
    account: one("Account", "accounts", a => a.accountId),
    opp:     one("Opportunity", "opps", a => a.oppId),
    contact: one("Contact", "contacts", a => a.contactId),
  },
  callReports: {
    account: one("Account", "accounts", r => r.accountId),
    opp:     one("Opportunity", "opps", r => r.oppId),
    lead:    one("Lead", "leads", r => r.leadId),
  },
  quotes: {
    account: one("Account", "accounts", q => q.accountId),
    opp:     one("Opportunity", "opps", q => q.oppId),
  },
  contracts: {
    account:     one("Account", "accounts", c => c.accountId),
    opp:         one("Opportunity", "opps", c => c.oppId),
    collections: many("Collections", "collections", (c, x) => x.contractId === c.id),
  },
  collections: {
    account:  one("Account", "accounts", c => c.accountId),
    contract: one("Contract", "contracts", c => c.contractId),
  },
  tickets: {
    account: one("Account", "accounts", t => t.accountId),
  },
};

const fieldsOfRel = (rel) => (rel.def ? rel.def.fields : SOURCES[rel.of].fields);
const FN_LABEL = { count: "Count", sum: "Sum of", avg: "Average", latest: "Latest", earliest: "Earliest", list: "List of" };

/** Every column a report on `source` can show, grouped for a picker. */
export function columnOptions(source) {
  const src = SOURCES[source];
  if (!src) return [];
  const groups = [{ group: `${src.label} fields`, options: src.fields.map(f => ({ id: `f:${f.key}`, label: f.label })) }];
  for (const [rk, rel] of Object.entries(RELATIONS[source] || {})) {
    const fields = fieldsOfRel(rel);
    if (rel.kind === "one") {
      groups.push({ group: `${rel.label} (linked)`, options: fields.map(f => ({ id: `l:${rk}:${f.key}`, label: `${rel.label} › ${f.label}` })) });
    } else {
      const opts = [{ id: `a:${rk}:count`, label: `${rel.label} › Count` }];
      for (const f of fields) {
        if (f.type === "num") opts.push({ id: `a:${rk}:sum:${f.key}`, label: `${rel.label} › Sum of ${f.label}` }, { id: `a:${rk}:avg:${f.key}`, label: `${rel.label} › Average ${f.label}` });
        if (f.type === "date") opts.push({ id: `a:${rk}:latest:${f.key}`, label: `${rel.label} › Latest ${f.label}` }, { id: `a:${rk}:earliest:${f.key}`, label: `${rel.label} › Earliest ${f.label}` });
      }
      for (const f of fields) if (["text", "user"].includes(f.type)) opts.push({ id: `a:${rk}:list:${f.key}`, label: `${rel.label} › List of ${f.label}` });
      groups.push({ group: `${rel.label} (linked, per ${src.one.toLowerCase()})`, options: opts });
    }
  }
  return groups;
}

/** Parse a column id into what it means: { id, label, type, get(rec, data, ctx) }. */
export function resolveColumn(source, id) {
  const parts = String(id || "").split(":");
  const src = SOURCES[source];
  if (!src) return null;
  if (parts[0] === "f") {
    const f = src.fields.find(x => x.key === parts[1]);
    if (!f) return null;
    return { id, label: f.label, type: f.type, get: (rec) => rec[f.key] };
  }
  const rel = (RELATIONS[source] || {})[parts[1]];
  if (!rel) return null;
  if (parts[0] === "l" && rel.kind === "one") {
    const f = fieldsOfRel(rel).find(x => x.key === parts[2]);
    if (!f) return null;
    return { id, label: `${rel.label} › ${f.label}`, type: f.type, get: (rec, data) => rel.row(rec, data)?.[f.key] };
  }
  if (parts[0] === "a" && rel.kind === "many") {
    const fn = parts[2];
    if (fn === "count") return { id, label: `${rel.label} › Count`, type: "num", get: (rec, data) => rel.rows(rec, data).length };
    const f = fieldsOfRel(rel).find(x => x.key === parts[3]);
    if (!f || !FN_LABEL[fn]) return null;
    const label = `${rel.label} › ${FN_LABEL[fn]} ${f.label}`;
    const vals = (rec, data) => rel.rows(rec, data).map(r => r[f.key]).filter(v => v !== undefined && v !== null && v !== "");
    if (fn === "sum") return { id, label, type: "num", get: (r, d) => +vals(r, d).reduce((s, v) => s + (Number(v) || 0), 0).toFixed(2) };
    if (fn === "avg") return { id, label, type: "num", get: (r, d) => { const v = vals(r, d); return v.length ? +(v.reduce((s, x) => s + (Number(x) || 0), 0) / v.length).toFixed(2) : ""; } };
    if (fn === "latest") return { id, label, type: "date", get: (r, d) => vals(r, d).map(String).sort().pop() || "" };
    if (fn === "earliest") return { id, label, type: "date", get: (r, d) => vals(r, d).map(String).sort()[0] || "" };
    if (fn === "list") return { id, label, type: f.type === "user" ? "userlist" : "list", get: (r, d) => [...new Set(vals(r, d))] };
  }
  return null;
}

// ── Display ─────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(d || "");
}
/** Plain text for a value (tables, CSV, grouping). ctx: { userName(id), accountName(id) } */
export function display(type, v, ctx = {}) {
  if (v === undefined || v === null || v === "") return "";
  if (type === "user") return ctx.userName ? ctx.userName(v) : String(v);
  if (type === "account") return ctx.accountName ? ctx.accountName(v) : String(v);
  if (type === "date") return fmtDate(v);
  if (type === "bool") return v ? "Yes" : "No";
  if (type === "num") return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (type === "userlist") return (v || []).map(x => (ctx.userName ? ctx.userName(x) : x)).join(", ");
  if (Array.isArray(v)) return v.map(x => (typeof x === "object" ? x?.name || x?.id || "" : x)).join(", ");
  if (typeof v === "object") return v.name || v.id || "";
  return String(v);
}

// ── Filters ─────────────────────────────────────────────────────────
export const OPS = [
  { id: "is", label: "is" }, { id: "not", label: "is not" },
  { id: "any", label: "is any of" }, { id: "none", label: "is none of" },
  { id: "contains", label: "contains" },
  { id: "gt", label: ">" }, { id: "gte", label: "≥" }, { id: "lt", label: "<" }, { id: "lte", label: "≤" },
  { id: "before", label: "before" }, { id: "after", label: "after" },
  { id: "lastDays", label: "in the last N days" }, { id: "nextDays", label: "in the next N days" },
  { id: "pastDue", label: "is before today" },
  { id: "empty", label: "is empty" }, { id: "notEmpty", label: "is not empty" },
];
export const NO_VALUE_OPS = new Set(["empty", "notEmpty", "pastDue"]);

function addDays(date, n) {
  const [y, m, d] = String(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10);
}

/** Does one value pass one filter? `shown` is its display text. */
export function passes(op, raw, shown, value, today) {
  const isEmpty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
  const txt = String(shown ?? "").toLowerCase();
  const want = String(value ?? "").trim().toLowerCase();
  const list = want.split(",").map(s => s.trim()).filter(Boolean);
  const num = Number(raw);
  const d = String(raw || "").slice(0, 10);
  switch (op) {
    case "is": return txt === want || String(raw ?? "").toLowerCase() === want;
    case "not": return !(txt === want || String(raw ?? "").toLowerCase() === want);
    case "any": return list.some(w => txt === w || String(raw ?? "").toLowerCase() === w);
    case "none": return !list.some(w => txt === w || String(raw ?? "").toLowerCase() === w);
    case "contains": return txt.includes(want);
    case "gt": return !isEmpty && num > Number(value);
    case "gte": return !isEmpty && num >= Number(value);
    case "lt": return !isEmpty && num < Number(value);
    case "lte": return !isEmpty && num <= Number(value);
    case "before": return !isEmpty && d < String(value);
    case "after": return !isEmpty && d > String(value);
    case "lastDays": return !isEmpty && d <= today && d >= addDays(today, -(Number(value) || 0));
    case "nextDays": return !isEmpty && d >= today && d <= addDays(today, Number(value) || 0);
    case "pastDue": return !isEmpty && d < today;
    case "empty": return isEmpty;
    case "notEmpty": return !isEmpty;
    default: return true;
  }
}

// ── Grouping keys for dates ─────────────────────────────────────────
export function bucketOf(dateStr, by) {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return "(no date)";
  const y = Number(m[1]), mo = Number(m[2]);
  if (by === "month") return `${m[1]}-${m[2]}`;
  if (by === "year") return m[1];
  if (by === "fy") { const s = mo >= 4 ? y : y - 1; return `FY ${s}-${String((s + 1) % 100).padStart(2, "0")}`; }
  if (by === "quarter") { const fy = mo >= 4 ? y : y - 1; const q = Math.floor(((mo + 8) % 12) / 3) + 1; return `FY${String((fy + 1) % 100).padStart(2, "0")} Q${q}`; }
  return String(dateStr);
}
const bucketLabel = (key, by) => (by === "month" && /^\d{4}-\d{2}$/.test(key) ? `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}` : key);

/**
 * Run a report.
 *   spec: the saved report; data: every list (opps, accounts, …, files, notes)
 *   ctx:  { today, userName(id), accountName(id), keep(rec) → bool }
 *         `keep` applies the page's period / team / owner filters to the main table.
 * Returns { columns, rows:[{rec, values, shown}], total, groups|null, error }.
 */
export function runReport(spec, data, ctx = {}) {
  const src = SOURCES[spec?.source];
  if (!src) return { columns: [], rows: [], total: 0, groups: null, error: "Pick a main table." };
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  const colIds = [...new Set([...(spec.columns || []), ...(spec.filters || []).map(f => f.col), spec.groupBy?.col, spec.sort?.col].filter(Boolean))];
  const cols = colIds.map(id => resolveColumn(spec.source, id)).filter(Boolean);
  const byId = Object.fromEntries(cols.map(c => [c.id, c]));
  const shownCols = (spec.columns || []).map(id => byId[id]).filter(Boolean);

  let base = (data[src.list] || []).filter(r => r && !r.isDeleted);
  if (ctx.keep) base = base.filter(ctx.keep);

  let rows = base.map(rec => {
    const values = {}, shown = {};
    for (const c of cols) { values[c.id] = c.get(rec, data, ctx); shown[c.id] = display(c.type, values[c.id], ctx); }
    return { rec, values, shown };
  });

  for (const f of spec.filters || []) {
    const c = byId[f.col];
    if (!c || !f.op) continue;
    if (!NO_VALUE_OPS.has(f.op) && String(f.value ?? "").trim() === "") continue;   // half-filled filter: ignore
    rows = rows.filter(r => passes(f.op, r.values[c.id], r.shown[c.id], f.value, today));
  }

  const sc = spec.sort?.col && byId[spec.sort.col];
  if (sc) {
    const dir = spec.sort.dir === "desc" ? -1 : 1;
    const key = (r) => (sc.type === "num" ? (r.values[sc.id] === "" || r.values[sc.id] == null ? -Infinity : Number(r.values[sc.id])) : (sc.type === "date" ? String(r.values[sc.id] || "") : r.shown[sc.id].toLowerCase()));
    rows = [...rows].sort((a, b) => { const x = key(a), y = key(b); return x < y ? -dir : x > y ? dir : 0; });
  }

  let groups = null;
  const gc = spec.groupBy?.col && byId[spec.groupBy.col];
  if (gc) {
    const by = gc.type === "date" ? (spec.groupBy.by || "month") : "value";
    const numCols = shownCols.filter(c => c.type === "num");
    const map = new Map();
    for (const r of rows) {
      const keys = gc.type === "date" ? [bucketOf(r.values[gc.id], by)]
        : Array.isArray(r.values[gc.id]) && r.values[gc.id].length ? r.values[gc.id].map(v => display(gc.type === "userlist" ? "user" : "text", v, ctx))
        : [r.shown[gc.id] || "(blank)"];
      for (const k of keys) {
        const g = map.get(k) || { key: k, label: gc.type === "date" ? bucketLabel(k, by) : k, count: 0, sums: Object.fromEntries(numCols.map(c => [c.id, 0])) };
        g.count += 1;
        for (const c of numCols) g.sums[c.id] = +(g.sums[c.id] + (Number(r.values[c.id]) || 0)).toFixed(2);
        map.set(k, g);
      }
    }
    groups = [...map.values()];
    groups.sort(gc.type === "date" ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  return { columns: shownCols, rows, total: rows.length, groups, error: "" };
}

/** CSV text for the report rows (every row, not just the page on screen). */
export function toCSV(result) {
  const esc = (s) => { const t = String(s ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = result.columns.map(c => esc(c.label)).join(",");
  const body = result.rows.map(r => result.columns.map(c => esc(c.type === "num" ? (r.values[c.id] ?? "") : r.shown[c.id])).join(","));
  return [head, ...body].join("\n");
}

// ── Starter reports ─────────────────────────────────────────────────
export const STARTER_REPORTS = [
  { id: "starter_opp360", name: "Opportunity 360: calls, activities & documents per opp", source: "opps",
    columns: ["f:oppNo", "f:title", "f:accountId", "f:stage", "f:value", "f:owner", "f:closeDate",
      "a:calls:count", "a:calls:latest:callDate", "a:activities:count", "a:activities:latest:date",
      "a:documents:count", "a:quotes:count", "a:quotes:sum:total"],
    filters: [], groupBy: { col: "" }, sort: { col: "f:value", dir: "desc" }, chart: "bar" },
  { id: "starter_pipeline", name: "Open pipeline by stage", source: "opps",
    columns: ["f:oppNo", "f:title", "f:accountId", "f:stage", "f:owner", "f:value", "f:closeDate"],
    filters: [{ col: "f:stage", op: "none", value: "Won, Lost" }], groupBy: { col: "f:stage" }, sort: { col: "f:value", dir: "desc" }, chart: "bar" },
  { id: "starter_leads_source", name: "Leads by source", source: "leads",
    columns: ["f:leadId", "f:company", "f:source", "f:stage", "f:assignedTo", "f:createdDate", "a:calls:count"],
    filters: [], groupBy: { col: "f:source" }, sort: { col: "f:createdDate", dir: "desc" }, chart: "pie" },
  { id: "starter_calls_month", name: "Calls per month", source: "callReports",
    columns: ["f:callDate", "f:company", "f:callType", "f:outcome", "f:marketingPerson", "f:duration"],
    filters: [], groupBy: { col: "f:callDate", by: "month" }, sort: { col: "f:callDate", dir: "desc" }, chart: "bar" },
  { id: "starter_calls_person", name: "Calls per person", source: "callReports",
    columns: ["f:callDate", "f:company", "f:callType", "f:outcome", "f:marketingPerson"],
    filters: [], groupBy: { col: "f:marketingPerson" }, sort: { col: "f:callDate", dir: "desc" }, chart: "bar" },
  { id: "starter_overdue_coll", name: "Overdue collections by account", source: "collections",
    columns: ["f:invoiceNo", "f:accountId", "f:invoiceDate", "f:dueDate", "f:billedAmount", "f:pendingAmount", "f:status"],
    filters: [{ col: "f:pendingAmount", op: "gt", value: "0" }, { col: "f:dueDate", op: "pastDue", value: "" }],
    groupBy: { col: "f:accountId" }, sort: { col: "f:pendingAmount", dir: "desc" }, chart: "bar" },
  { id: "starter_quotes_status", name: "Quotes by status", source: "quotes",
    columns: ["f:quoteNo", "f:title", "f:accountId", "f:status", "f:total", "f:owner", "f:createdDate"],
    filters: [], groupBy: { col: "f:status" }, sort: { col: "f:createdDate", dir: "desc" }, chart: "pie" },
  { id: "starter_account360", name: "Account 360: deals, calls, tickets per account", source: "accounts",
    columns: ["f:name", "f:owner", "f:status", "a:opps:count", "a:opps:sum:value", "a:calls:count", "a:calls:latest:callDate",
      "a:activities:latest:date", "a:tickets:count", "a:collections:sum:pendingAmount"],
    filters: [], groupBy: { col: "" }, sort: { col: "a:opps:sum:value", dir: "desc" }, chart: "bar" },
];

export const blankReport = (source = "opps") => ({
  id: "", name: "", source,
  columns: SOURCES[source].fields.slice(0, 5).map(f => `f:${f.key}`),
  filters: [], groupBy: { col: "" }, sort: { col: "", dir: "asc" }, chart: "bar",
});

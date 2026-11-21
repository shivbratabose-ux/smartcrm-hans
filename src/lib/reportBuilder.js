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
const F = (key, label, type = "text", summary = "sum") => ({ key, label, type, summary });
// Calculated field: worked out per record. summary "avg" = groups show the
// average (days, ages) instead of the sum.
const C = (key, label, type, calc, summary = "sum") => ({ key, label, type, calc, summary, calculated: true });
const dayDiff = (a, b) => {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a || "")), pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(b || ""));
  if (!pa || !pb) return "";
  return Math.round((Date.UTC(+pb[1], +pb[2] - 1, +pb[3]) - Date.UTC(+pa[1], +pa[2] - 1, +pa[3])) / 864e5);
};
const dealStatus = (o, c) => (c.isWon?.(o) ? "Won" : c.isLost?.(o) ? "Lost" : "Open");
const TICKET_DONE = new Set(["Resolved", "Closed"]);
const overdueDays = (x, c) => ((Number(x.pendingAmount) || 0) > 0 && x.dueDate && x.dueDate < c.today ? dayDiff(x.dueDate, c.today) : 0);
/** Value of a field on a record (stored or calculated). */
export const valueOf = (f, rec, ctx = {}) => (f.calc ? f.calc(rec, ctx) : rec?.[f.key]);

export const SOURCES = {
  opps: {
    label: "Opportunities", one: "Opportunity", list: "opps", owner: "owner", date: "closeDate",
    fields: [
      F("oppNo", "Opp ID"), F("title", "Title"), F("accountId", "Account", "account"), F("stage", "Stage"),
      F("value", "Value (₹ L)", "num"), F("probability", "Probability %", "num", "avg"), F("owner", "Owner", "user"),
      F("closeDate", "Close date", "date"), F("createdDate", "Created", "date"), F("source", "Source"),
      F("lob", "LOB"), F("forecastCat", "Forecast category"), F("dealSize", "Deal size"), F("country", "Country"),
      F("territory", "Territory"), F("products", "Products", "list"), F("nextStep", "Next step"),
      F("competitors", "Competitors"), F("lossReason", "Loss reason"), F("isTender", "Tender", "bool"),
      F("submissionDate", "Tender submission", "date"),
      C("status", "Deal status (Open / Won / Lost)", "text", dealStatus),
      C("weighted", "Weighted value (₹ L)", "num", o => +((Number(o.value) || 0) * (Number(o.probability) || 0) / 100).toFixed(2)),
      C("ageDays", "Deal age (days)", "num", (o, c) => (o.createdDate ? dayDiff(o.createdDate, c.today) : ""), "avg"),
      C("cycleDays", "Sales cycle, won (days)", "num", (o, c) => (c.isWon?.(o) && o.createdDate && o.closeDate ? dayDiff(o.createdDate, o.closeDate) : ""), "avg"),
      C("daysToClose", "Days to close, open (days)", "num", (o, c) => (dealStatus(o, c) === "Open" && o.closeDate ? dayDiff(c.today, o.closeDate) : ""), "avg"),
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
      F("createdDate", "Created", "date"), F("nextCall", "Next call", "date"), F("score", "Score", "num", "avg"),
      F("temperature", "Temperature"), F("estimatedValue", "Estimated value", "num"),
      F("accountId", "Account", "account"), F("campaignName", "Campaign"),
      C("converted", "Converted", "bool", l => l.stage === "Converted" || (Array.isArray(l.convertedOppIds) && l.convertedOppIds.length > 0)),
      C("ageDays", "Lead age (days)", "num", (l, c) => (l.createdDate ? dayDiff(l.createdDate, c.today) : ""), "avg"),
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
      C("overdue", "Overdue", "bool", (a, c) => a.status === "Planned" && !!a.date && a.date < c.today),
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
      C("isDemo", "Demo", "bool", r => /\bdemo\b/i.test(String(r.callType || ""))),
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
      C("daysToAccept", "Days from sent to accepted", "num", q => (q.sentDate && q.acceptedDate ? dayDiff(q.sentDate, q.acceptedDate) : ""), "avg"),
      C("daysSinceSent", "Days since sent, not accepted", "num", (q, c) => (q.sentDate && !q.acceptedDate ? dayDiff(q.sentDate, c.today) : ""), "avg"),
    ],
  },
  contracts: {
    label: "Contracts", one: "Contract", list: "contracts", owner: "owner", date: "startDate",
    fields: [
      F("contractNo", "Contract No"), F("title", "Title"), F("accountId", "Account", "account"), F("status", "Status"),
      F("product", "Product"), F("value", "Value", "num"), F("startDate", "Start", "date"), F("endDate", "End", "date"),
      F("renewalDate", "Renewal", "date"), F("billingFrequency", "Billing frequency"),
      F("commercialModel", "Commercial model"), F("owner", "Owner", "user"),
      C("daysToRenewal", "Days to renewal / end", "num", (x, c) => { const d = x.renewalDate || x.endDate; return d ? dayDiff(c.today, d) : ""; }, "avg"),
    ],
  },
  collections: {
    label: "Collections", one: "Invoice", list: "collections", owner: "owner", date: "invoiceDate",
    fields: [
      F("invoiceNo", "Invoice No"), F("accountId", "Account", "account"), F("invoiceDate", "Invoice date", "date"),
      F("dueDate", "Due date", "date"), F("billedAmount", "Billed", "num"), F("collectedAmount", "Collected", "num"),
      F("pendingAmount", "Pending", "num"), F("status", "Status"), F("paymentDate", "Paid on", "date"),
      F("product", "Product"), F("owner", "Owner", "user"), F("agingBucket", "Ageing"),
      C("daysOverdue", "Days overdue", "num", overdueDays, "avg"),
      C("ageingBand", "Ageing band", "text", (x, c) => {
        if (!((Number(x.pendingAmount) || 0) > 0)) return "Paid";
        const d = overdueDays(x, c);
        return d <= 0 ? "Not yet due" : d <= 30 ? "1–30 days" : d <= 60 ? "31–60 days" : d <= 90 ? "61–90 days" : "90+ days";
      }),
    ],
  },
  tickets: {
    label: "Tickets", one: "Ticket", list: "tickets", owner: "assigned", date: "reportedDate",
    fields: [
      F("ticketNo", "Ticket No"), F("title", "Title"), F("accountId", "Account", "account"), F("product", "Product"),
      F("type", "Type"), F("priority", "Priority"), F("severity", "Severity"), F("status", "Status"),
      F("assigned", "Assigned to", "user"), F("reportedDate", "Reported", "date"),
      F("resolvedDate", "Resolved", "date"), F("csat", "CSAT", "num", "avg"), F("category", "Category"),
      C("resolutionDays", "Resolution time (days)", "num", t => (t.reportedDate && t.resolvedDate ? dayDiff(t.reportedDate, t.resolvedDate) : ""), "avg"),
      C("openDays", "Open for (days)", "num", (t, c) => (!TICKET_DONE.has(t.status) && t.reportedDate ? dayDiff(t.reportedDate, c.today) : ""), "avg"),
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
    return { id, label: f.label, type: f.type, summary: f.summary || "sum", calculated: !!f.calc, get: (rec, data, ctx) => valueOf(f, rec, ctx) };
  }
  const rel = (RELATIONS[source] || {})[parts[1]];
  if (!rel) return null;
  if (parts[0] === "l" && rel.kind === "one") {
    const f = fieldsOfRel(rel).find(x => x.key === parts[2]);
    if (!f) return null;
    return { id, label: `${rel.label} › ${f.label}`, type: f.type, summary: f.summary || "sum", get: (rec, data, ctx) => { const p = rel.row(rec, data); return p ? valueOf(f, p, ctx) : undefined; } };
  }
  if (parts[0] === "a" && rel.kind === "many") {
    const fn = parts[2];
    if (fn === "count") return { id, label: `${rel.label} › Count`, type: "num", summary: "sum", get: (rec, data) => rel.rows(rec, data).length };
    const f = fieldsOfRel(rel).find(x => x.key === parts[3]);
    if (!f || !FN_LABEL[fn]) return null;
    const label = `${rel.label} › ${FN_LABEL[fn]} ${f.label}`;
    const vals = (rec, data, ctx) => rel.rows(rec, data).map(r => valueOf(f, r, ctx)).filter(v => v !== undefined && v !== null && v !== "");
    if (fn === "sum") return { id, label, type: "num", summary: "sum", get: (r, d, c) => +vals(r, d, c).reduce((s, v) => s + (Number(v) || 0), 0).toFixed(2) };
    if (fn === "avg") return { id, label, type: "num", summary: "avg", get: (r, d, c) => { const v = vals(r, d, c); return v.length ? +(v.reduce((s, x) => s + (Number(x) || 0), 0) / v.length).toFixed(2) : ""; } };
    if (fn === "latest") return { id, label, type: "date", get: (r, d, c) => vals(r, d, c).map(String).sort().pop() || "" };
    if (fn === "earliest") return { id, label, type: "date", get: (r, d, c) => vals(r, d, c).map(String).sort()[0] || "" };
    if (fn === "list") return { id, label, type: f.type === "user" ? "userlist" : "list", get: (r, d, c) => [...new Set(vals(r, d, c))] };
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
  { id: "today", label: "is today" }, { id: "thisMonth", label: "is this month" }, { id: "lastMonth", label: "is last month" },
  { id: "thisQuarter", label: "is this quarter (FY)" }, { id: "thisFY", label: "is this financial year" },
  { id: "lastDays", label: "in the last N days" }, { id: "nextDays", label: "in the next N days" },
  { id: "olderThanDays", label: "more than N days ago, or never" },
  { id: "pastDue", label: "is before today" },
  { id: "empty", label: "is empty" }, { id: "notEmpty", label: "is not empty" },
];
export const NO_VALUE_OPS = new Set(["empty", "notEmpty", "pastDue", "today", "thisMonth", "lastMonth", "thisQuarter", "thisFY"]);

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
    case "olderThanDays": return isEmpty || d < addDays(today, -(Number(value) || 0));
    case "pastDue": return !isEmpty && d < today;
    case "today": return !isEmpty && d === today;
    case "thisMonth": return !isEmpty && d.slice(0, 7) === today.slice(0, 7);
    case "lastMonth": { const [y, m] = today.split("-").map(Number); const p = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; return !isEmpty && d.slice(0, 7) === p; }
    case "thisQuarter": return !isEmpty && bucketOf(d, "quarter") === bucketOf(today, "quarter");
    case "thisFY": return !isEmpty && bucketOf(d, "fy") === bucketOf(today, "fy");
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
  const colIds = [...new Set([...(spec.columns || []), ...(spec.filters || []).map(f => f.col), spec.groupBy?.col, spec.groupBy2?.col, spec.sort?.col].filter(Boolean))];
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

  // ── Grouping: one level (summary) or two (matrix, e.g. Owner × Stage) ──
  let groups = null, groups2 = null;
  const gc = spec.groupBy?.col && byId[spec.groupBy.col];
  if (gc) {
    const numCols = shownCols.filter(c => c.type === "num");
    const keysOf = (col, by, r) => {
      if (col.type === "date") return [bucketOf(r.values[col.id], by)];
      const v = r.values[col.id];
      if (Array.isArray(v) && v.length) return v.map(x => display(col.type === "userlist" ? "user" : "text", x, ctx));
      return [r.shown[col.id] || "(blank)"];
    };
    const blank = () => ({ count: 0, sums: Object.fromEntries(numCols.map(c => [c.id, 0])), n: {} });
    const add = (agg, r) => {
      agg.count += 1;
      for (const c of numCols) {
        const v = r.values[c.id];
        if (v === "" || v == null || Number.isNaN(Number(v))) continue;
        agg.sums[c.id] += Number(v); agg.n[c.id] = (agg.n[c.id] || 0) + 1;
      }
    };
    const done = (agg) => {
      agg.avgs = {};
      for (const c of numCols) { agg.sums[c.id] = +agg.sums[c.id].toFixed(2); agg.avgs[c.id] = agg.n[c.id] ? +(agg.sums[c.id] / agg.n[c.id]).toFixed(2) : 0; }
      delete agg.n; return agg;
    };
    const by1 = gc.type === "date" ? (spec.groupBy.by || "month") : "value";
    const gc2 = spec.groupBy2?.col && spec.groupBy2.col !== gc.id && byId[spec.groupBy2.col];
    const by2 = gc2 && gc2.type === "date" ? (spec.groupBy2.by || "month") : "value";
    const map = new Map(), keys2 = new Map();
    for (const r of rows) {
      for (const k of keysOf(gc, by1, r)) {
        const g = map.get(k) || { key: k, label: gc.type === "date" ? bucketLabel(k, by1) : k, ...blank(), cells: {} };
        add(g, r);
        if (gc2) for (const k2 of keysOf(gc2, by2, r)) {
          keys2.set(k2, (keys2.get(k2) || 0) + 1);
          add(g.cells[k2] || (g.cells[k2] = blank()), r);
        }
        map.set(k, g);
      }
    }
    groups = [...map.values()].map(g => { done(g); Object.values(g.cells).forEach(done); return g; });
    groups.sort(gc.type === "date" ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (gc2) groups2 = [...keys2.entries()]
      .sort(gc2.type === "date" ? (a, b) => a[0].localeCompare(b[0]) : (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => ({ key, label: gc2.type === "date" ? bucketLabel(key, by2) : key }));
  }

  return { columns: shownCols, rows, total: rows.length, groups, groups2, error: "" };
}

/** A group's (or matrix cell's) number for a measure: "count", or a numeric column (its sum, or average for day/age columns). */
export function measure(agg, col) {
  if (!agg) return 0;
  if (!col || col === "count") return agg.count;
  return col.summary === "avg" ? (agg.avgs?.[col.id] ?? 0) : (agg.sums?.[col.id] ?? 0);
}

/** CSV text for the report rows (every row, not just the page on screen). */
export function toCSV(result) {
  const esc = (s) => { const t = String(s ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = result.columns.map(c => esc(c.label)).join(",");
  const body = result.rows.map(r => result.columns.map(c => esc(c.type === "num" ? (r.values[c.id] ?? "") : r.shown[c.id])).join(","));
  return [head, ...body].join("\n");
}

// ── Starter reports ─────────────────────────────────────────────────
// A library modelled on the standard reports of Zoho CRM, Salesforce,
// HubSpot and Freshsales, limited to what SmartCRM records. Each one opens
// in the builder, so users can tweak it and save their own copy.
const S = (id, category, name, source, columns, o = {}) => ({
  id: `starter_${id}`, category, name, source, columns,
  filters: o.filters || [], groupBy: o.groupBy || { col: "" }, groupBy2: o.groupBy2 || { col: "" },
  sort: o.sort || { col: "", dir: "asc" }, chart: o.chart || "bar", chartValue: o.chartValue || "count",
});
const OPEN = { col: "f:status", op: "is", value: "Open" };
const WON = { col: "f:status", op: "is", value: "Won" };
const LOST = { col: "f:status", op: "is", value: "Lost" };
const OPP = ["f:oppNo", "f:title", "f:accountId", "f:stage", "f:value", "f:owner", "f:closeDate"];

export const STARTER_CATEGORIES = ["Deals & pipeline", "Sales performance", "Forecast", "Leads", "Calls & activities", "Accounts & contacts", "Quotations", "Contracts & renewals", "Collections", "Support"];

export const STARTER_REPORTS = [
  // Deals & pipeline
  S("opp360", "Deals & pipeline", "Opportunity 360: calls, activities & documents per opp", "opps",
    [...OPP, "a:calls:count", "a:calls:latest:callDate", "a:activities:count", "a:activities:latest:date", "a:documents:count", "a:quotes:count", "a:quotes:sum:total"],
    { sort: { col: "f:value", dir: "desc" } }),
  S("pipeline", "Deals & pipeline", "Open pipeline by stage", "opps", OPP,
    { filters: [OPEN], groupBy: { col: "f:stage" }, sort: { col: "f:value", dir: "desc" }, chartValue: "f:value" }),
  S("owner_stage", "Deals & pipeline", "Pipeline by owner × stage (matrix)", "opps", OPP,
    { filters: [OPEN], groupBy: { col: "f:owner" }, groupBy2: { col: "f:stage" }, chartValue: "f:value" }),
  S("closing_month", "Deals & pipeline", "Deals closing this month", "opps", [...OPP, "f:probability", "f:nextStep"],
    { filters: [OPEN, { col: "f:closeDate", op: "thisMonth", value: "" }], sort: { col: "f:closeDate", dir: "asc" } }),
  S("overdue_close", "Deals & pipeline", "Open deals past their close date", "opps", [...OPP, "f:nextStep"],
    { filters: [OPEN, { col: "f:closeDate", op: "pastDue", value: "" }], groupBy: { col: "f:owner" }, sort: { col: "f:closeDate", dir: "asc" } }),
  S("stalled", "Deals & pipeline", "Stalled deals: no activity or call in 30 days", "opps", [...OPP, "a:activities:latest:date", "a:calls:latest:callDate"],
    { filters: [OPEN, { col: "a:activities:latest:date", op: "olderThanDays", value: "30" }, { col: "a:calls:latest:callDate", op: "olderThanDays", value: "30" }], groupBy: { col: "f:owner" }, sort: { col: "f:value", dir: "desc" } }),
  S("large", "Deals & pipeline", "Large deals (₹50 L and above)", "opps", [...OPP, "f:probability"],
    { filters: [OPEN, { col: "f:value", op: "gte", value: "50" }], sort: { col: "f:value", dir: "desc" } }),
  S("by_product", "Deals & pipeline", "Open pipeline by product", "opps", [...OPP, "f:products"],
    { filters: [OPEN], groupBy: { col: "f:products" }, chartValue: "f:value" }),
  S("by_lob", "Deals & pipeline", "Pipeline by LOB and stage (matrix)", "opps", [...OPP, "f:lob"],
    { filters: [OPEN], groupBy: { col: "f:lob" }, groupBy2: { col: "f:stage" }, chartValue: "f:value" }),
  S("tenders", "Deals & pipeline", "Tender bids by submission date", "opps", [...OPP, "f:submissionDate"],
    { filters: [{ col: "f:isTender", op: "is", value: "Yes" }], sort: { col: "f:submissionDate", dir: "asc" } }),
  // Sales performance
  S("won_owner", "Sales performance", "Sales by salesperson (won, this FY)", "opps", OPP,
    { filters: [WON, { col: "f:closeDate", op: "thisFY", value: "" }], groupBy: { col: "f:owner" }, chartValue: "f:value", sort: { col: "f:value", dir: "desc" } }),
  S("won_month", "Sales performance", "Monthly sales trend (won)", "opps", OPP,
    { filters: [WON], groupBy: { col: "f:closeDate", by: "month" }, chartValue: "f:value", sort: { col: "f:closeDate", dir: "desc" } }),
  S("won_source", "Sales performance", "Sales by lead source (won)", "opps", [...OPP, "f:source"],
    { filters: [WON], groupBy: { col: "f:source" }, chartValue: "f:value", chart: "pie" }),
  S("lost_reasons", "Sales performance", "Lost deals and reasons", "opps", [...OPP, "f:lossReason", "f:competitors"],
    { filters: [LOST], groupBy: { col: "f:lossReason" }, chart: "pie", sort: { col: "f:closeDate", dir: "desc" } }),
  S("win_loss", "Sales performance", "Win / loss by owner (matrix)", "opps", [...OPP, "f:status"],
    { filters: [{ col: "f:status", op: "any", value: "Won, Lost" }], groupBy: { col: "f:owner" }, groupBy2: { col: "f:status" } }),
  S("cycle_owner", "Sales performance", "Sales cycle by owner (avg days to win)", "opps", [...OPP, "f:createdDate", "f:cycleDays"],
    { filters: [WON], groupBy: { col: "f:owner" }, chartValue: "f:cycleDays" }),
  S("cycle_source", "Sales performance", "Sales cycle by lead source", "opps", [...OPP, "f:source", "f:cycleDays"],
    { filters: [WON], groupBy: { col: "f:source" }, chartValue: "f:cycleDays" }),
  S("deal_size", "Sales performance", "Won value and deal count by owner", "opps", [...OPP],
    { filters: [WON], groupBy: { col: "f:owner" }, chartValue: "f:value" }),
  // Forecast
  S("weighted_stage", "Forecast", "Weighted pipeline by stage", "opps", [...OPP, "f:probability", "f:weighted"],
    { filters: [OPEN], groupBy: { col: "f:stage" }, chartValue: "f:weighted" }),
  S("forecast_cat", "Forecast", "Forecast by category and month", "opps", [...OPP, "f:forecastCat", "f:weighted"],
    { filters: [OPEN], groupBy: { col: "f:closeDate", by: "month" }, groupBy2: { col: "f:forecastCat" }, chartValue: "f:value" }),
  S("by_probability", "Forecast", "Pipeline by probability", "opps", [...OPP, "f:probability", "f:weighted"],
    { filters: [OPEN], groupBy: { col: "f:probability" }, chartValue: "f:value" }),
  S("quarter_close", "Forecast", "Open pipeline closing by FY quarter", "opps", [...OPP, "f:weighted"],
    { filters: [OPEN], groupBy: { col: "f:closeDate", by: "quarter" }, chartValue: "f:value" }),
  // Leads
  S("leads_source", "Leads", "Leads by source", "leads", ["f:leadId", "f:company", "f:source", "f:stage", "f:assignedTo", "f:createdDate", "a:calls:count"],
    { groupBy: { col: "f:source" }, chart: "pie", sort: { col: "f:createdDate", dir: "desc" } }),
  S("leads_stage", "Leads", "Lead funnel by stage", "leads", ["f:leadId", "f:company", "f:stage", "f:assignedTo", "f:createdDate"],
    { groupBy: { col: "f:stage" } }),
  S("leads_owner_stage", "Leads", "Leads by owner × stage (matrix)", "leads", ["f:leadId", "f:company", "f:stage", "f:assignedTo"],
    { groupBy: { col: "f:assignedTo" }, groupBy2: { col: "f:stage" } }),
  S("leads_month", "Leads", "New leads this month", "leads", ["f:leadId", "f:company", "f:contact", "f:source", "f:assignedTo", "f:createdDate"],
    { filters: [{ col: "f:createdDate", op: "thisMonth", value: "" }], sort: { col: "f:createdDate", dir: "desc" } }),
  S("leads_converted", "Leads", "Converted leads by owner", "leads", ["f:leadId", "f:company", "f:assignedTo", "f:createdDate", "f:converted", "a:opps:count", "a:opps:sum:value"],
    { filters: [{ col: "f:converted", op: "is", value: "Yes" }], groupBy: { col: "f:assignedTo" } }),
  S("leads_untouched", "Leads", "Leads never called", "leads", ["f:leadId", "f:company", "f:assignedTo", "f:createdDate", "f:ageDays", "a:calls:count"],
    { filters: [{ col: "a:calls:count", op: "is", value: "0" }, { col: "f:stage", op: "not", value: "Converted" }], groupBy: { col: "f:assignedTo" }, sort: { col: "f:createdDate", dir: "asc" } }),
  S("leads_vertical", "Leads", "Leads by vertical", "leads", ["f:leadId", "f:company", "f:vertical", "f:stage", "f:assignedTo"],
    { groupBy: { col: "f:vertical" }, chart: "pie" }),
  S("leads_region", "Leads", "Leads by region × stage (matrix)", "leads", ["f:leadId", "f:company", "f:region", "f:country", "f:stage"],
    { groupBy: { col: "f:region" }, groupBy2: { col: "f:stage" } }),
  S("leads_followup", "Leads", "Lead follow-ups due this week", "leads", ["f:leadId", "f:company", "f:contact", "f:assignedTo", "f:nextCall", "a:calls:latest:callDate"],
    { filters: [{ col: "f:nextCall", op: "nextDays", value: "7" }], sort: { col: "f:nextCall", dir: "asc" } }),
  // Calls & activities
  S("calls_month", "Calls & activities", "Calls per month", "callReports", ["f:callDate", "f:company", "f:callType", "f:outcome", "f:marketingPerson", "f:duration"],
    { groupBy: { col: "f:callDate", by: "month" }, sort: { col: "f:callDate", dir: "desc" } }),
  S("calls_person", "Calls & activities", "Calls per person", "callReports", ["f:callDate", "f:company", "f:callType", "f:outcome", "f:marketingPerson"],
    { groupBy: { col: "f:marketingPerson" }, sort: { col: "f:callDate", dir: "desc" } }),
  S("calls_today", "Calls & activities", "Today's calls", "callReports", ["f:callTime", "f:company", "f:leadName", "f:callType", "f:outcome", "f:marketingPerson"],
    { filters: [{ col: "f:callDate", op: "today", value: "" }], sort: { col: "f:callTime", dir: "asc" } }),
  S("call_outcomes", "Calls & activities", "Call outcomes by person (matrix)", "callReports", ["f:callDate", "f:company", "f:outcome", "f:marketingPerson"],
    { groupBy: { col: "f:marketingPerson" }, groupBy2: { col: "f:outcome" } }),
  S("demos", "Calls & activities", "Demos by month × person (matrix)", "callReports", ["f:callDate", "f:company", "f:callType", "f:marketingPerson", "f:product"],
    { filters: [{ col: "f:isDemo", op: "is", value: "Yes" }], groupBy: { col: "f:callDate", by: "month" }, groupBy2: { col: "f:marketingPerson" } }),
  S("acts_type_owner", "Calls & activities", "Activities by owner × type (matrix)", "activities", ["f:date", "f:title", "f:type", "f:status", "f:owner"],
    { groupBy: { col: "f:owner" }, groupBy2: { col: "f:type" } }),
  S("acts_overdue", "Calls & activities", "Overdue activities", "activities", ["f:date", "f:title", "f:type", "f:owner", "f:accountId"],
    { filters: [{ col: "f:overdue", op: "is", value: "Yes" }], groupBy: { col: "f:owner" }, sort: { col: "f:date", dir: "asc" } }),
  S("acts_done_month", "Calls & activities", "Completed activities this month", "activities", ["f:date", "f:title", "f:type", "f:owner", "f:outcome"],
    { filters: [{ col: "f:status", op: "is", value: "Completed" }, { col: "f:date", op: "thisMonth", value: "" }], groupBy: { col: "f:owner" } }),
  // Accounts & contacts
  S("account360", "Accounts & contacts", "Account 360: deals, calls, tickets per account", "accounts",
    ["f:name", "f:owner", "f:status", "a:opps:count", "a:opps:sum:value", "a:calls:count", "a:calls:latest:callDate", "a:activities:latest:date", "a:tickets:count", "a:collections:sum:pendingAmount"],
    { sort: { col: "a:opps:sum:value", dir: "desc" } }),
  S("key_accounts", "Accounts & contacts", "Key accounts by ARR", "accounts", ["f:name", "f:owner", "f:segment", "f:arrRevenue", "a:contracts:count", "a:opps:count"],
    { filters: [{ col: "f:arrRevenue", op: "gt", value: "0" }], sort: { col: "f:arrRevenue", dir: "desc" } }),
  S("accounts_type", "Accounts & contacts", "Accounts by type × status (matrix)", "accounts", ["f:name", "f:type", "f:status", "f:owner"],
    { groupBy: { col: "f:type" }, groupBy2: { col: "f:status" } }),
  S("accounts_country", "Accounts & contacts", "Accounts by country", "accounts", ["f:name", "f:country", "f:city", "f:owner"],
    { groupBy: { col: "f:country" }, chart: "pie" }),
  S("accounts_owner", "Accounts & contacts", "Accounts by owner", "accounts", ["f:name", "f:owner", "f:status", "a:opps:count"],
    { groupBy: { col: "f:owner" } }),
  S("neglected", "Accounts & contacts", "Neglected accounts: no activity in 90 days", "accounts", ["f:name", "f:owner", "f:status", "a:activities:latest:date", "a:calls:latest:callDate"],
    { filters: [{ col: "a:activities:latest:date", op: "olderThanDays", value: "90" }, { col: "a:calls:latest:callDate", op: "olderThanDays", value: "90" }], groupBy: { col: "f:owner" } }),
  S("contacts_list", "Accounts & contacts", "Contact mailing list", "contacts", ["f:name", "f:designation", "f:accountId", "f:email", "f:phone", "f:city", "f:country"],
    { sort: { col: "f:accountId", dir: "asc" } }),
  S("contacts_account", "Accounts & contacts", "Contacts per account, with last call", "contacts", ["f:name", "f:designation", "f:accountId", "f:decisionLevel", "a:calls:count", "a:calls:latest:callDate"],
    { groupBy: { col: "f:accountId" } }),
  // Quotations
  S("quotes_status", "Quotations", "Quotes by status", "quotes", ["f:quoteNo", "f:title", "f:accountId", "f:status", "f:total", "f:owner", "f:createdDate"],
    { groupBy: { col: "f:status" }, chart: "pie", sort: { col: "f:createdDate", dir: "desc" } }),
  S("quotes_approval", "Quotations", "Quotes waiting for approval", "quotes", ["f:quoteNo", "f:title", "f:accountId", "f:total", "f:discount", "f:owner", "f:createdDate"],
    { filters: [{ col: "f:approvalStatus", op: "contains", value: "pending" }], sort: { col: "f:createdDate", dir: "asc" } }),
  S("quotes_open", "Quotations", "Sent quotes not yet accepted", "quotes", ["f:quoteNo", "f:title", "f:accountId", "f:total", "f:sentDate", "f:daysSinceSent", "f:owner"],
    { filters: [{ col: "f:sentDate", op: "notEmpty", value: "" }, { col: "f:acceptedDate", op: "empty", value: "" }], sort: { col: "f:sentDate", dir: "asc" } }),
  S("quotes_month", "Quotations", "Quote value by month", "quotes", ["f:quoteNo", "f:accountId", "f:status", "f:total", "f:createdDate"],
    { groupBy: { col: "f:createdDate", by: "month" }, chartValue: "f:total" }),
  S("quotes_accept", "Quotations", "Time to acceptance by owner", "quotes", ["f:quoteNo", "f:accountId", "f:total", "f:sentDate", "f:acceptedDate", "f:daysToAccept", "f:owner"],
    { filters: [{ col: "f:acceptedDate", op: "notEmpty", value: "" }], groupBy: { col: "f:owner" }, chartValue: "f:daysToAccept" }),
  // Contracts & renewals
  S("renewals_90", "Contracts & renewals", "Renewals due in the next 90 days", "contracts", ["f:contractNo", "f:title", "f:accountId", "f:product", "f:value", "f:renewalDate", "f:endDate", "f:daysToRenewal", "f:owner"],
    { filters: [{ col: "f:daysToRenewal", op: "lte", value: "90" }, { col: "f:daysToRenewal", op: "gte", value: "0" }], sort: { col: "f:daysToRenewal", dir: "asc" } }),
  S("contracts_product", "Contracts & renewals", "Contract value by product × model (matrix)", "contracts", ["f:contractNo", "f:accountId", "f:product", "f:commercialModel", "f:value", "f:status"],
    { groupBy: { col: "f:product" }, groupBy2: { col: "f:commercialModel" }, chartValue: "f:value" }),
  S("contracts_billing", "Contracts & renewals", "Contracts: billed, collected and pending", "contracts", ["f:contractNo", "f:accountId", "f:value", "a:collections:sum:billedAmount", "a:collections:sum:collectedAmount", "a:collections:sum:pendingAmount"],
    { sort: { col: "a:collections:sum:pendingAmount", dir: "desc" } }),
  // Collections
  S("overdue_coll", "Collections", "Overdue collections by account", "collections", ["f:invoiceNo", "f:accountId", "f:invoiceDate", "f:dueDate", "f:billedAmount", "f:pendingAmount", "f:daysOverdue", "f:status"],
    { filters: [{ col: "f:pendingAmount", op: "gt", value: "0" }, { col: "f:dueDate", op: "pastDue", value: "" }], groupBy: { col: "f:accountId" }, sort: { col: "f:pendingAmount", dir: "desc" }, chartValue: "f:pendingAmount" }),
  S("ageing", "Collections", "Receivables ageing (0–30 / 31–60 / 61–90 / 90+)", "collections", ["f:invoiceNo", "f:accountId", "f:dueDate", "f:pendingAmount", "f:daysOverdue", "f:ageingBand"],
    { filters: [{ col: "f:pendingAmount", op: "gt", value: "0" }], groupBy: { col: "f:ageingBand" }, chartValue: "f:pendingAmount" }),
  S("collected_month", "Collections", "Collected this month", "collections", ["f:invoiceNo", "f:accountId", "f:paymentDate", "f:collectedAmount", "f:owner"],
    { filters: [{ col: "f:paymentDate", op: "thisMonth", value: "" }], groupBy: { col: "f:owner" }, chartValue: "f:collectedAmount" }),
  S("billing_month", "Collections", "Billed vs collected by month", "collections", ["f:invoiceNo", "f:accountId", "f:invoiceDate", "f:billedAmount", "f:collectedAmount", "f:pendingAmount"],
    { groupBy: { col: "f:invoiceDate", by: "month" }, chartValue: "f:billedAmount" }),
  // Support
  S("tickets_status_pri", "Support", "Tickets by status × priority (matrix)", "tickets", ["f:ticketNo", "f:title", "f:accountId", "f:status", "f:priority", "f:assigned"],
    { groupBy: { col: "f:status" }, groupBy2: { col: "f:priority" } }),
  S("tickets_open_account", "Support", "Open tickets by account", "tickets", ["f:ticketNo", "f:title", "f:accountId", "f:priority", "f:reportedDate", "f:openDays", "f:assigned"],
    { filters: [{ col: "f:status", op: "none", value: "Resolved, Closed" }], groupBy: { col: "f:accountId" }, sort: { col: "f:openDays", dir: "desc" } }),
  S("tickets_resolution", "Support", "Resolution time by product", "tickets", ["f:ticketNo", "f:product", "f:priority", "f:reportedDate", "f:resolvedDate", "f:resolutionDays"],
    { filters: [{ col: "f:resolvedDate", op: "notEmpty", value: "" }], groupBy: { col: "f:product" }, chartValue: "f:resolutionDays" }),
  S("tickets_csat", "Support", "CSAT by product", "tickets", ["f:ticketNo", "f:product", "f:accountId", "f:csat"],
    { filters: [{ col: "f:csat", op: "gt", value: "0" }], groupBy: { col: "f:product" }, chartValue: "f:csat" }),
  S("tickets_engineer", "Support", "Tickets per engineer by month (matrix)", "tickets", ["f:ticketNo", "f:title", "f:assigned", "f:status", "f:reportedDate"],
    { groupBy: { col: "f:reportedDate", by: "month" }, groupBy2: { col: "f:assigned" } }),
];

export const blankReport = (source = "opps") => ({
  id: "", name: "", source,
  columns: SOURCES[source].fields.slice(0, 5).map(f => `f:${f.key}`),
  filters: [], groupBy: { col: "" }, sort: { col: "", dir: "asc" }, chart: "bar",
});

// ═══════════════════════════════════════════════════════════════════
// TeamSummary — the Calendar's "Team" view for admins and managers
// ═══════════════════════════════════════════════════════════════════
// One row per person in the viewer's scope, one column per day (week) or
// per week (month). Each cell is that person's completed work in the
// bucket; the right-hand columns break the period down. Counting rules
// live in utils/teamSummary.js (tested). Clicking a name opens the week
// calendar filtered to that person.
import { useMemo } from "react";
import { Phone, PhoneCall, Users, CheckCircle2, Clock, AlertTriangle, UserX } from "lucide-react";
import { buildTeamSummary } from "../utils/teamSummary";

const heat = (n, max) => {
  if (!n) return "transparent";
  const a = 0.12 + 0.55 * Math.min(1, n / Math.max(1, max));
  return `rgba(27,107,90,${a.toFixed(2)})`;
};

const cellTitle = (c) =>
  `${c.callsMade} call${c.callsMade === 1 ? "" : "s"} (${c.connected} connected) · ${c.meetings} meeting${c.meetings === 1 ? "" : "s"} · ${c.otherDone} other · ${c.pending} pending · ${c.overdue} overdue`;

function Kpi({ icon, label, value, sub, tone }) {
  return (
    <div className="kpi" style={{ flex: 1, minWidth: 150 }}>
      <div className="kpi-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>{icon}{label}</div>
      <div className="kpi-val" style={{ fontSize: 22, color: tone || "var(--text1)" }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export default function TeamSummary({ activities, callReports, events, users, columns, today, onPickUser }) {
  const s = useMemo(
    () => buildTeamSummary({ activities, callReports, events, users, columns, today }),
    [activities, callReports, events, users, columns, today]);

  const maxCell = useMemo(() => {
    let m = 0;
    s.rows.forEach(r => columns.forEach(c => { m = Math.max(m, s.doneOf(r.cells[c.key])); }));
    return m;
  }, [s, columns]);

  const idle = s.rows.filter(r => r.done === 0).length;
  const connectRate = s.totals.callsMade ? Math.round(s.totals.connected / s.totals.callsMade * 100) : 0;
  const num = { fontFamily: "'Outfit',sans-serif", fontVariantNumeric: "tabular-nums" };
  const th = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text3)", padding: "8px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", background: "var(--s2)" };
  const td = { padding: "7px 8px", borderBottom: "1px solid var(--border)", fontSize: 12.5, whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <Kpi icon={<Phone size={12} />} label="Calls made" value={s.totals.callsMade}
          sub={`${s.totals.connected} connected · ${connectRate}% connect rate`} />
        <Kpi icon={<Users size={12} />} label="Meetings" value={s.totals.meetings} sub={`${s.totals.otherDone} other activities done`} />
        <Kpi icon={<Clock size={12} />} label="Pending" value={s.totals.pending} sub="planned, not yet due" />
        <Kpi icon={<AlertTriangle size={12} />} label="Overdue" value={s.totals.overdue}
          sub="planned work that slipped" tone={s.totals.overdue ? "var(--red)" : undefined} />
        <Kpi icon={<UserX size={12} />} label="No activity" value={`${idle}/${s.rows.length}`}
          sub="members with nothing logged" tone={idle ? "#B45309" : undefined} />
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, zIndex: 1 }}>Member</th>
              {columns.map(c => (
                <th key={c.key} style={{ ...th, textAlign: "center", background: c.from <= today && c.to >= today ? "var(--brand-bg)" : th.background }}>{c.label}</th>
              ))}
              <th style={{ ...th, textAlign: "right", borderLeft: "2px solid var(--border)" }}><PhoneCall size={11} style={{ verticalAlign: "-1px" }} /> Calls</th>
              <th style={{ ...th, textAlign: "right" }}>Connected</th>
              <th style={{ ...th, textAlign: "right" }}>Meetings</th>
              <th style={{ ...th, textAlign: "right" }}>Other</th>
              <th style={{ ...th, textAlign: "right" }}>Pending</th>
              <th style={{ ...th, textAlign: "right" }}>Overdue</th>
              <th style={{ ...th, textAlign: "right" }}><CheckCircle2 size={11} style={{ verticalAlign: "-1px" }} /> Done %</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.length === 0 && (
              <tr><td colSpan={columns.length + 8} style={{ ...td, textAlign: "center", color: "var(--text3)", padding: 24 }}>No team members in your scope.</td></tr>
            )}
            {s.rows.map(r => (
              <tr key={r.user.id}>
                <td style={{ ...td, position: "sticky", left: 0, background: "var(--surface)", zIndex: 1 }}>
                  <button type="button" onClick={() => onPickUser(r.user.id)} title={`Open ${r.user.name}'s calendar`}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--brand)", color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {r.user.initials || (r.user.name || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span style={{ textAlign: "left" }}>
                      <span className="tbl-link" style={{ fontWeight: 600 }}>{r.user.name}</span>
                      <span style={{ display: "block", fontSize: 10, color: r.done === 0 ? "#B45309" : "var(--text3)", fontWeight: r.done === 0 ? 700 : 400 }}>
                        {r.done === 0 ? "no activity logged" : r.user.role}
                      </span>
                    </span>
                  </button>
                </td>
                {columns.map(c => {
                  const cell = r.cells[c.key];
                  const done = s.doneOf(cell);
                  return (
                    <td key={c.key} title={cellTitle(cell)}
                      style={{ ...td, textAlign: "center", background: heat(done, maxCell), color: done / Math.max(1, maxCell) > 0.6 ? "#fff" : "var(--text1)" }}>
                      <span style={{ ...num, fontWeight: 700 }}>{done || <span style={{ color: "var(--text3)", fontWeight: 400 }}>—</span>}</span>
                      {cell.overdue > 0 && <span style={{ display: "block", fontSize: 9.5, color: "var(--red)", fontWeight: 700 }}>{cell.overdue} overdue</span>}
                    </td>
                  );
                })}
                <td style={{ ...td, ...num, textAlign: "right", fontWeight: 700, borderLeft: "2px solid var(--border)" }}>{r.total.callsMade}</td>
                <td style={{ ...td, ...num, textAlign: "right" }}>{r.total.connected}</td>
                <td style={{ ...td, ...num, textAlign: "right" }}>{r.total.meetings}</td>
                <td style={{ ...td, ...num, textAlign: "right" }}>{r.total.otherDone}</td>
                <td style={{ ...td, ...num, textAlign: "right", color: "var(--text3)" }}>{r.total.pending}</td>
                <td style={{ ...td, ...num, textAlign: "right", color: r.total.overdue ? "var(--red)" : "var(--text3)", fontWeight: r.total.overdue ? 700 : 400 }}>{r.total.overdue}</td>
                <td style={{ ...td, ...num, textAlign: "right", fontWeight: 700, color: r.completionPct == null ? "var(--text3)" : r.completionPct >= 80 ? "#15803D" : r.completionPct >= 50 ? "#B45309" : "var(--red)" }}>
                  {r.completionPct == null ? "—" : `${r.completionPct}%`}
                </td>
              </tr>
            ))}
          </tbody>
          {s.rows.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--s2)", fontWeight: 700 }}>
                <td style={{ ...td, position: "sticky", left: 0, background: "var(--s2)", zIndex: 1 }}>Team total · {s.rows.length}</td>
                {columns.map(c => <td key={c.key} style={{ ...td, ...num, textAlign: "center" }}>{s.doneOf(s.columnTotals[c.key]) || "—"}</td>)}
                <td style={{ ...td, ...num, textAlign: "right", borderLeft: "2px solid var(--border)" }}>{s.totals.callsMade}</td>
                <td style={{ ...td, ...num, textAlign: "right" }}>{s.totals.connected}</td>
                <td style={{ ...td, ...num, textAlign: "right" }}>{s.totals.meetings}</td>
                <td style={{ ...td, ...num, textAlign: "right" }}>{s.totals.otherDone}</td>
                <td style={{ ...td, ...num, textAlign: "right" }}>{s.totals.pending}</td>
                <td style={{ ...td, ...num, textAlign: "right", color: s.totals.overdue ? "var(--red)" : undefined }}>{s.totals.overdue}</td>
                <td style={{ ...td, textAlign: "right" }} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
        Cells show completed work (calls attempted + meetings + other activities). Hover a cell for the breakdown; click a name to open that person's calendar. A no-answer call counts as a call made, not as connected.
      </div>
    </div>
  );
}

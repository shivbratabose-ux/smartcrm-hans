// ═══════════════════════════════════════════════════════════════════
// TeamSummary — the Calendar's "Team" view for admins and managers
// ═══════════════════════════════════════════════════════════════════
// One row per person in the viewer's scope, one column per day (week) or
// per week (month). Each cell is that person's completed work in the
// bucket; the right-hand columns break the period down. Counting rules
// live in utils/teamSummary.js (tested). Clicking a name opens the week
// calendar filtered to that person.
import { useMemo } from "react";
import { Phone, PhoneCall, Users, Target, Clock, AlertTriangle, UserX } from "lucide-react";
import { buildTeamSummary, CALL_TARGET, fmtDays } from "../utils/teamSummary";

const heat = (n, max) => {
  if (!n) return "transparent";
  const a = 0.12 + 0.55 * Math.min(1, n / Math.max(1, max));
  return `rgba(27,107,90,${a.toFixed(2)})`;
};

// Compliance colour: on target green, within 80% amber, below that red.
const complianceTone = (pct) => pct == null ? "var(--text3)" : pct >= 100 ? "#15803D" : pct >= 80 ? "#B45309" : "var(--red)";

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

export default function TeamSummary({ activities, callReports, events, users, columns, today, holidays = [], onPickUser }) {
  const s = useMemo(
    () => buildTeamSummary({ activities, callReports, events, users, columns, today, holidays }),
    [activities, callReports, events, users, columns, today, holidays]);
  const offLabel = (n) => `${n} holiday${n === 1 ? "" : "s"}/admin day${n === 1 ? "" : "s"}`;

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
        <Kpi icon={<Target size={12} />} label="On call target"
          value={s.compliance.eligible ? `${s.compliance.onTarget}/${s.compliance.eligible}` : "—"}
          sub={(s.compliance.eligible
            ? `${s.compliance.calls} of ${fmtDays(s.compliance.target)} target calls · ${s.compliance.pct}%`
            : `no working days yet · ${CALL_TARGET.perDay}/day target`)
            + (s.offDays.length ? ` · ${offLabel(s.offDays.length)} excluded` : "")
            + (s.compliance.leaveDays ? ` · ${fmtDays(s.compliance.leaveDays)} leave day${s.compliance.leaveDays === 1 ? "" : "s"}` : "")}
          tone={s.compliance.eligible ? complianceTone(s.compliance.pct) : undefined} />
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
              {columns.map(c => {
                const off = s.columnOffDays[c.key];
                const isToday = c.from <= today && c.to >= today;
                return (
                  <th key={c.key} title={off.length ? off.map(h => `${h.date} · ${h.name} (${h.type || "Holiday"})`).join("\n") : undefined}
                    style={{ ...th, textAlign: "center", background: isToday ? "var(--brand-bg)" : off.length && c.from === c.to ? "#FEF3C7" : th.background }}>
                    {c.label}
                    {off.length > 0 && (
                      <span style={{ display: "block", fontSize: 9, fontWeight: 600, textTransform: "none", letterSpacing: 0, color: "#B45309", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", margin: "0 auto" }}>
                        {c.from === c.to ? off[0].name : offLabel(off.length)}
                      </span>
                    )}
                  </th>
                );
              })}
              <th style={{ ...th, textAlign: "right", borderLeft: "2px solid var(--border)" }}><PhoneCall size={11} style={{ verticalAlign: "-1px" }} /> Calls</th>
              <th style={{ ...th, textAlign: "right" }}>Connected</th>
              <th style={{ ...th, textAlign: "right" }}>Meetings</th>
              <th style={{ ...th, textAlign: "right" }}>Other</th>
              <th style={{ ...th, textAlign: "right" }}>Pending</th>
              <th style={{ ...th, textAlign: "right" }}>Overdue</th>
              <th style={{ ...th, textAlign: "right" }} title={`${CALL_TARGET.perDay} calls per working day (Mon–Fri) to date`}>Call target</th>
              <th style={{ ...th, textAlign: "right" }}><Target size={11} style={{ verticalAlign: "-1px" }} /> Compliance</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.length === 0 && (
              <tr><td colSpan={columns.length + 9} style={{ ...td, textAlign: "center", color: "var(--text3)", padding: 24 }}>No team members in your scope.</td></tr>
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
                        {r.leaveDays > 0 && <span style={{ color: "#B45309", fontWeight: 600 }}> · {fmtDays(r.leaveDays)}d leave</span>}
                      </span>
                    </span>
                  </button>
                </td>
                {columns.map(c => {
                  const cell = r.cells[c.key];
                  const done = s.doneOf(cell);
                  const tgt = r.cellTargets[c.key];
                  // Only a bucket that has fully passed can be "short"; today is still in play.
                  const short = tgt > 0 && cell.callsMade < tgt && c.to < today;
                  return (
                    <td key={c.key} title={cellTitle(cell)}
                      style={{ ...td, textAlign: "center", background: heat(done, maxCell), color: done / Math.max(1, maxCell) > 0.6 ? "#fff" : "var(--text1)" }}>
                      <span style={{ ...num, fontWeight: 700 }}>{done || <span style={{ color: "var(--text3)", fontWeight: 400 }}>—</span>}</span>
                      {r.cellLeave[c.key] > 0 && (
                        <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, color: "#B45309" }}>
                          {c.from === c.to ? (r.cellLeave[c.key] >= 1 ? "On leave" : "½ day leave") : `${fmtDays(r.cellLeave[c.key])}d leave`}
                        </span>
                      )}
                      {tgt > 0 && (
                        <span style={{ display: "block", fontSize: 9.5, fontWeight: short ? 700 : 500, color: short ? "var(--red)" : cell.callsMade >= tgt ? "#15803D" : "var(--text3)" }}>
                          {cell.callsMade}/{fmtDays(tgt)} calls
                        </span>
                      )}
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
                <td style={{ ...td, ...num, textAlign: "right", color: "var(--text2)" }}
                  title={r.targeted ? `${r.total.callsMade} calls made of ${fmtDays(r.callTarget)} due so far${r.leaveDays ? ` · ${fmtDays(r.leaveDays)} day(s) leave excluded` : ""}` : "No call target for this role"}>
                  {r.targeted ? (r.callTarget > 0 ? `${r.total.callsMade} / ${fmtDays(r.callTarget)}` : r.leaveDays > 0 ? "on leave" : "0 / 0") : "—"}
                </td>
                <td style={{ ...td, ...num, textAlign: "right", fontWeight: 700, color: complianceTone(r.callCompliancePct) }}>
                  {r.callCompliancePct == null ? "—" : `${r.callCompliancePct}%`}
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
                <td style={{ ...td, ...num, textAlign: "right" }}>{s.compliance.eligible ? `${s.compliance.calls} / ${fmtDays(s.compliance.target)}` : "—"}</td>
                <td style={{ ...td, ...num, textAlign: "right", color: complianceTone(s.compliance.pct) }}>{s.compliance.pct == null ? "—" : `${s.compliance.pct}%`}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
        Cells show completed work (calls attempted + meetings + other activities). Hover a cell for the breakdown; click a name to open that person's calendar. A no-answer call counts as a call made, not as connected.
        {" "}Call target: {CALL_TARGET.perDay} calls per working day (Mon–Fri) for Sales Executives, BD Leads, Country Managers and Line Managers, counted up to today — compliance = calls made ÷ target to date. Holidays and admin days set in Masters → Activity, and a person's own leave (Mark Leave), carry no target; calls made on them still count.
      </div>
    </div>
  );
}

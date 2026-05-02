import { useState, useMemo } from "react";
import { RotateCcw, Trash2, AlertCircle, AlertTriangle, Clock } from "lucide-react";
import { restoreById } from "../utils/helpers";
import { notify } from "../utils/toast";
import { purgeTrashRecord, purgeExpiredTrash } from "../lib/db";

/**
 * Trash — admin-only review panel for soft-deleted records across all modules.
 *
 * Lists every record where isDeleted === true, grouped by module. For each
 * row admins can:
 *   - Restore (clears soft-delete flags)
 *   - Permanently delete now (calls purge_trash_record SQL function)
 *
 * Header also exposes an "Empty expired" action that runs purge_expired_trash
 * to hard-delete every row past the 90-day retention window across every
 * soft-deletable table in one transaction.
 *
 * The deletion category + reason are displayed inline so an auditor can
 * understand why each record was removed without leaving the page. The
 * audit_log row keeps the same metadata permanently — even after the
 * 90-day purge wipes the entity row.
 *
 * Read-only visibility: the parent page is gated behind canRestore in
 * SmartCRM (admin/md/director only). If a non-admin reaches this page
 * (e.g. via stale URL), we render a soft refusal instead of any data.
 */
function Trash({ canRestore, canPurge, currentUser, sources, orgUsers }) {
  if (!canRestore) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text2)" }}>
        <AlertCircle size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          Insufficient permissions
        </div>
        <div style={{ fontSize: 13 }}>
          Only Admin, MD, or Director roles can review or restore deleted records.
        </div>
      </div>
    );
  }

  // Filter sources to only those with at least one deleted item, then preserve config order
  const groups = useMemo(() => sources
    .map(s => ({ ...s, items: (s.items || []).filter(r => r?.isDeleted) }))
    .filter(g => g.items.length > 0), [sources]);

  const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
  const [activeKey, setActiveKey] = useState(groups[0]?.key || null);
  const [purgeBusy, setPurgeBusy] = useState(false);

  // Keep activeKey valid as restore actions empty out the current group
  const active = groups.find(g => g.key === activeKey) || groups[0] || null;

  const userName = (id) => orgUsers?.find(u => u.id === id)?.name || id || "—";

  const fmtDate = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  // Days remaining before this row hits the 90-day retention cutoff and
  // becomes eligible for hard-purge. Negative means already past the
  // cutoff (will be wiped on the next "Empty expired" run).
  const daysUntilPurge = (deletedAt) => {
    if (!deletedAt) return null;
    const ms = new Date(deletedAt).getTime() + 90 * 86400000 - Date.now();
    return Math.round(ms / 86400000);
  };

  const handleRestore = (group, item) => {
    group.setter(prev => restoreById(prev, item.id, currentUser));
    notify.success(`Restored ${group.label.replace(/s$/, "")}: ${group.getName(item) || item.id}`);
  };

  // Hard-delete one record now. Asks for explicit confirmation since this
  // is irreversible. The local-state setter strips the row out of the
  // module's list immediately; the server-side delete is handled by the
  // existing supabase delta-sync that watches each module table.
  const handlePurgeOne = async (group, item) => {
    if (!canPurge) return;
    if (!window.confirm(`Permanently delete "${group.getName(item) || item.id}"? This cannot be undone.`)) return;
    const { error } = await purgeTrashRecord(group.key, item.id);
    if (error) {
      notify.error(`Purge failed: ${error.message || error}`);
      return;
    }
    // Locally drop the row from the trashed list. The setter is the same
    // one used for soft-delete/restore, so we just filter out the id.
    group.setter(prev => (prev || []).filter(r => r.id !== item.id));
    notify.success(`Permanently deleted ${group.label.replace(/s$/, "")}: ${group.getName(item) || item.id}`);
  };

  const handlePurgeExpired = async () => {
    if (!canPurge) return;
    if (!window.confirm("Permanently delete every trashed record past the 90-day retention window? This cannot be undone.")) return;
    setPurgeBusy(true);
    const { error, results } = await purgeExpiredTrash();
    setPurgeBusy(false);
    if (error) {
      notify.error(`Purge failed: ${error.message || error}`);
      return;
    }
    if (!results.length) { notify.info("No records were past the 90-day window."); return; }
    // Drop expired rows from every group's local state to mirror the DB.
    for (const g of groups) {
      g.setter(prev => (prev || []).filter(r => {
        if (!r?.isDeleted || !r.deletedAt) return true;
        return (Date.now() - new Date(r.deletedAt).getTime()) < 90 * 86400000;
      }));
    }
    const total = results.reduce((n, r) => n + Number(r.purged_count || 0), 0);
    notify.success(`Purged ${total} expired record${total === 1 ? "" : "s"} across ${results.length} table${results.length === 1 ? "" : "s"}.`);
  };

  if (totalCount === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text2)" }}>
        <Trash2 size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
          Trash is empty
        </div>
        <div style={{ fontSize: 13 }}>
          Soft-deleted records from any module will appear here for review and restore.
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Trash</h2>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {totalCount} deleted record{totalCount === 1 ? "" : "s"} across {groups.length} module{groups.length === 1 ? "" : "s"}.
            Records auto-expire after 90 days. Restore returns the record to its module list.
          </div>
        </div>
        {canPurge && (
          <button
            className="btn btn-sec btn-sm"
            disabled={purgeBusy}
            onClick={handlePurgeExpired}
            title="Hard-delete every record past the 90-day retention window"
            style={{ color: "#B91C1C", borderColor: "#FCA5A5" }}
          >
            <AlertTriangle size={13} style={{ marginRight: 4 }} />
            {purgeBusy ? "Purging…" : "Empty expired"}
          </button>
        )}
      </div>

      {/* Module tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {groups.map(g => (
          <button
            key={g.key}
            onClick={() => setActiveKey(g.key)}
            className={active?.key === g.key ? "btn btn-pri btn-sm" : "btn btn-sec btn-sm"}
            style={{ borderRadius: "6px 6px 0 0" }}
          >
            {g.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({g.items.length})</span>
          </button>
        ))}
      </div>

      {/* Records table */}
      {active && (
        <div style={{ overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "var(--surface2,#F8FAFC)" }}>
              <tr>
                <th style={th}>Record</th>
                <th style={th}>Details</th>
                <th style={th}>Reason</th>
                <th style={th}>Deleted by</th>
                <th style={th}>Deleted at</th>
                <th style={th}>Retention</th>
                <th style={{ ...th, textAlign: "right", width: 220 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {active.items.map(item => {
                const days = daysUntilPurge(item.deletedAt);
                const expired = days != null && days <= 0;
                return (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{active.getName(item) || item.id}</div>
                      {item.id && (
                        <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{item.id}</div>
                      )}
                    </td>
                    <td style={{ ...td, color: "var(--text2)" }}>
                      {active.getMeta ? active.getMeta(item) : "—"}
                    </td>
                    <td style={td}>
                      {item.deleteReasonCategory ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, display: "inline-block", background: "#FEE2E2", color: "#991B1B" }}>
                            {item.deleteReasonCategory}
                          </div>
                          {item.deleteReason && (
                            <div style={{ fontSize: 11.5, color: "var(--text2)", marginTop: 4, lineHeight: 1.4, maxWidth: 320 }}>{item.deleteReason}</div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>(legacy — no reason captured)</span>
                      )}
                    </td>
                    <td style={td}>{userName(item.deletedBy)}</td>
                    <td style={td}>{fmtDate(item.deletedAt)}</td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: expired ? "#B91C1C" : days <= 14 ? "#B45309" : "#16A34A" }}>
                        <Clock size={11}/>
                        {days == null ? "—" : expired ? "Expired" : `${days}d left`}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button
                        className="btn btn-sec btn-sm"
                        onClick={() => handleRestore(active, item)}
                        title="Restore this record"
                        style={{ marginRight: 6 }}
                      >
                        <RotateCcw size={13} style={{ marginRight: 4 }} /> Restore
                      </button>
                      {canPurge && (
                        <button
                          className="btn btn-sec btn-sm"
                          onClick={() => handlePurgeOne(active, item)}
                          title="Permanently delete now (skips the 90-day window)"
                          style={{ color: "#B91C1C", borderColor: "#FCA5A5" }}
                        >
                          <Trash2 size={13} style={{ marginRight: 4 }} /> Purge
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "var(--text2)" };
const td = { padding: "10px 12px", verticalAlign: "top" };

export default Trash;

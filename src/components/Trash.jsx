import { useState, useMemo } from "react";
import { RotateCcw, Trash2, AlertCircle } from "lucide-react";
import { restoreById } from "../utils/helpers";

/**
 * Trash — admin-only review panel for soft-deleted records across all modules.
 *
 * Lists every record where isDeleted === true, grouped by module, with one
 * "Restore" button per row. Restoring clears isDeleted/deletedAt/deletedBy
 * and stamps restoredAt/restoredBy for the audit trail.
 *
 * Read-only visibility: the parent page is gated behind canRestore in
 * SmartCRM (admin/md/director only). If a non-admin reaches this page
 * (e.g. via stale URL), we render a soft refusal instead of any data.
 */
function Trash({ canRestore, currentUser, sources, orgUsers }) {
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

  // Keep activeKey valid as restore actions empty out the current group
  const active = groups.find(g => g.key === activeKey) || groups[0] || null;

  const userName = (id) => orgUsers?.find(u => u.id === id)?.name || id || "—";

  const fmtDate = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  const handleRestore = (group, id) => {
    group.setter(prev => restoreById(prev, id, currentUser));
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Trash</h2>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {totalCount} deleted record{totalCount === 1 ? "" : "s"} across {groups.length} module{groups.length === 1 ? "" : "s"}.
            Restore returns the record to its module list.
          </div>
        </div>
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
                <th style={th}>Deleted by</th>
                <th style={th}>Deleted at</th>
                <th style={{ ...th, textAlign: "right", width: 130 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {active.items.map(item => (
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
                  <td style={td}>{userName(item.deletedBy)}</td>
                  <td style={td}>{fmtDate(item.deletedAt)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button
                      className="btn btn-sec btn-sm"
                      onClick={() => handleRestore(active, item.id)}
                      title="Restore this record"
                    >
                      <RotateCcw size={13} style={{ marginRight: 4 }} /> Restore
                    </button>
                  </td>
                </tr>
              ))}
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

import { useState, useRef, useEffect } from "react";
import { CheckSquare, Trash2, Download, X, UserCheck, ChevronDown } from "lucide-react";
import { TypeaheadSelect } from "./shared";

export function useBulkSelect(items) {
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const clear = () => setSelected(new Set());
  const isSelected = (id) => selected.has(id);
  const allSelected = items.length > 0 && selected.size === items.length;

  return { selected, toggle, toggleAll, clear, isSelected, allSelected, count: selected.size };
}

/**
 * Bulk action bar shown above a list when one or more rows are selected.
 *
 * Reassign Owner: optional, admin-gated. When `onReassignOwner` is supplied
 * AND `orgUsers` is non-empty, renders a popover with a TypeaheadSelect of
 * active users and an Apply button. The handler receives the picked user.id;
 * caller is responsible for the actual write (so each module can stamp its
 * own ownerField name — assignedTo for leads, owner for opps/accounts/etc.).
 *
 * The reason this exists at all: bulk-imported records often land with
 * mis-resolved owners (a fuzzy-match latched onto the wrong user, or the
 * cell was blank and the record landed unassigned). Without an in-app
 * fixup, admins were forced to either edit each record one-by-one or
 * re-upload the CSV — tedious and error-prone for the kind of one-off
 * cleanup that prompted this feature (FL-2026-106..113 misassignment).
 */
export default function BulkActions({ count, onDelete, onExport, onClear, onReassignOwner, orgUsers = [] }) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [pickedUserId, setPickedUserId] = useState("");
  const wrapRef = useRef(null);

  // Close the reassign popover on outside click — saves a state-management
  // round-trip versus rendering it as a full Modal for what's effectively
  // a single-input dialog.
  useEffect(() => {
    if (!reassignOpen) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setReassignOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [reassignOpen]);

  if (count === 0) return null;

  const activeUsers = (orgUsers || []).filter(u => u.status !== "Inactive" && u.active !== false);
  const userOptions = activeUsers.map(u => ({
    value: u.id, label: u.name, sub: [u.role, u.email].filter(Boolean).join(" · "),
  }));

  const applyReassign = () => {
    if (!pickedUserId) return;
    onReassignOwner?.(pickedUserId);
    setReassignOpen(false);
    setPickedUserId("");
  };

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12, padding:"8px 16px",
      background:"var(--brand-bg)", borderRadius:8, marginBottom:12,
      border:"1px solid var(--brand)", fontSize:13,
    }}>
      <CheckSquare size={16} style={{color:"var(--brand)"}}/>
      <span style={{fontWeight:600,color:"var(--brand)"}}>{count} selected</span>
      <div style={{flex:1}}/>

      {onReassignOwner && (
        <div ref={wrapRef} style={{ position: "relative" }}>
          <button
            className="btn btn-sec btn-sm"
            onClick={() => setReassignOpen(o => !o)}
            title="Reassign the selected records to a different owner"
          >
            <UserCheck size={13}/>Reassign owner
            <ChevronDown size={12} style={{ marginLeft: 2 }}/>
          </button>
          {reassignOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              width: 320, background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, padding: 12, boxShadow: "0 12px 28px rgba(0,0,0,0.15)",
              zIndex: 200,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Reassign {count} record{count === 1 ? "" : "s"} to
              </div>
              <TypeaheadSelect
                value={pickedUserId}
                onChange={setPickedUserId}
                options={userOptions}
                placeholder="Search by name, email, or role…"
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
                <button className="btn btn-sec btn-sm" onClick={() => { setReassignOpen(false); setPickedUserId(""); }}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={applyReassign} disabled={!pickedUserId}>
                  <UserCheck size={12}/>Apply
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 }}>
                Updates the owner / assignedTo field on every selected row. The change is logged and visible in the record's history.
              </div>
            </div>
          )}
        </div>
      )}

      {onExport && (
        <button className="btn btn-sec btn-sm" onClick={onExport}>
          <Download size={13}/>Export CSV
        </button>
      )}
      {onDelete && (
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          <Trash2 size={13}/>Delete Selected
        </button>
      )}
      <button className="icon-btn" onClick={onClear} aria-label="Clear selection">
        <X size={16}/>
      </button>
    </div>
  );
}

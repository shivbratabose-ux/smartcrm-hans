// ═══════════════════════════════════════════════════════════════════
// DataGrid — reusable Excel-like table with per-user column presets
// ═══════════════════════════════════════════════════════════════════
// Used by Pipeline list, Leads list, and Accounts list. Each module
// passes its own column registry; the grid stays styling-agnostic and
// reuses the existing `.tbl` / `.tbl-scroll` CSS classes.
//
// Persistence model (see supabase/user_table_views_v1.sql):
//   - The grid loads saved views for (userId, module) on mount.
//   - The default view (is_default = true) auto-applies; otherwise the
//     `defaultColumnConfig` prop is used.
//   - Reordering / resizing / toggling visibility is *local state* —
//     nothing persists until the user clicks "Save view" or "Save as".
//     This matches Excel's behaviour and avoids surprise overwrites.
//
// "No auto-rearrange" guarantee:
//   - The `columnConfig` array IS the source of truth for order. We
//     never re-sort it client-side.
//   - When a registry column has no entry in columnConfig (e.g. a new
//     column shipped after the user saved their view), it shows up as
//     hidden in the column picker, and the user must explicitly add
//     it. Existing column order is never touched.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GripVertical, Eye, EyeOff, Columns3, Save, ChevronDown,
  Star, StarOff, Trash2, Plus, X, RotateCcw, Check,
} from "lucide-react";
import {
  loadUserTableViews, saveUserTableView,
  setDefaultUserTableView, deleteUserTableView,
} from "../lib/db";

// ── Helpers ─────────────────────────────────────────────────────────

// Merge a saved columnConfig with the registry. Returns ordered array
// of { key, visible, width, ...registryFields }. Registry columns NOT
// in the saved config land as visible:false at the end so the user can
// opt them in from the picker — never auto-injected at unexpected
// positions, satisfying "no auto-rearrange".
function mergeConfig(columnConfig, registry) {
  const byKey = new Map(registry.map(c => [c.key, c]));
  const seen = new Set();
  const merged = [];
  // 1) honour user-saved order first
  for (const cfg of columnConfig || []) {
    const reg = byKey.get(cfg.key);
    if (!reg) continue; // silently drop columns whose key is no longer in code
    seen.add(cfg.key);
    merged.push({
      ...reg,
      visible: cfg.visible !== false,
      width: cfg.width || reg.defaultWidth || 140,
    });
  }
  // 2) append registry columns the user has never seen — hidden by default
  for (const reg of registry) {
    if (seen.has(reg.key)) continue;
    merged.push({
      ...reg,
      visible: false,
      width: reg.defaultWidth || 140,
    });
  }
  return merged;
}

// Strip a merged-config back to the persisted shape.
function toPersistedConfig(merged) {
  return merged.map(c => ({ key: c.key, visible: !!c.visible, width: c.width || 140 }));
}

// Is `cfg` materially different from the view's saved column_config?
// Used to enable/disable the "Save changes" button.
function configsEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key) return false;
    if (!!a[i].visible !== !!b[i].visible) return false;
    if ((a[i].width || 0) !== (b[i].width || 0)) return false;
  }
  return true;
}

// ── Column manager modal ────────────────────────────────────────────

function ColumnManager({ merged, onChange, onClose, onReset }) {
  const [items, setItems] = useState(merged);
  const dragKey = useRef(null);

  useEffect(() => setItems(merged), [merged]);

  const move = (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    setItems(prev => {
      const next = [...prev];
      const [it] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, it);
      return next;
    });
  };

  const toggle = (key) => {
    setItems(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const setWidth = (key, w) => {
    const n = Math.max(60, Math.min(800, parseInt(w, 10) || 0));
    setItems(prev => prev.map(c => c.key === key ? { ...c, width: n } : c));
  };

  const apply = () => { onChange(items); onClose(); };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
            <Columns3 size={16} /> Manage columns
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: "8px 16px 4px", fontSize: 11, color: "var(--text3)" }}>
          Drag to reorder · click eye to show/hide · widths are pixels
        </div>

        <div style={{ maxHeight: 420, overflowY: "auto", padding: "0 8px" }}>
          {items.map((c, i) => (
            <div
              key={c.key}
              draggable
              onDragStart={() => { dragKey.current = c.key; }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (!dragKey.current || dragKey.current === c.key) return;
                const from = items.findIndex(x => x.key === dragKey.current);
                if (from < 0) return;
                move(from, i);
                dragKey.current = null;
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", margin: "2px 0",
                background: c.visible ? "var(--s2)" : "transparent",
                border: "1px solid var(--border)", borderRadius: 8,
                cursor: "grab",
              }}
            >
              <GripVertical size={14} color="var(--text3)" />
              <button
                className="icon-btn" aria-label={c.visible ? "Hide" : "Show"}
                onClick={() => toggle(c.key)}
                style={{ color: c.visible ? "var(--brand)" : "var(--text3)" }}
              >
                {c.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{c.label}</div>
              <input
                type="number" min={60} max={800} value={c.width || 140}
                onChange={e => setWidth(c.key, e.target.value)}
                style={{
                  width: 64, padding: "4px 6px", fontSize: 12,
                  border: "1px solid var(--border)", borderRadius: 6, textAlign: "right",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text3)", width: 16 }}>px</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
          <button className="btn-sec" onClick={onReset} style={btnSm}>
            <RotateCcw size={12} /> Reset to default
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-sec" onClick={onClose} style={btnSm}>Cancel</button>
            <button className="btn-primary" onClick={apply} style={btnSm}>
              <Check size={12} /> Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Saved-views dropdown / save-as dialog ───────────────────────────

function SavedViewsBar({
  views, activeViewId, dirty,
  onSelect, onSaveCurrent, onSaveAs, onSetDefault,
  onDelete, onOpenColumns,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = views.find(v => v.id === activeViewId);
  const activeLabel = active ? active.name : "Default columns";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {/* Active view picker */}
      <div ref={wrapRef} style={{ position: "relative" }}>
        <button
          className="btn-sec"
          onClick={() => setMenuOpen(o => !o)}
          style={{ ...btnSm, minWidth: 180, justifyContent: "space-between" }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Columns3 size={12} />
            <span style={{ fontWeight: 600 }}>{activeLabel}</span>
            {active?.isDefault && <Star size={10} style={{ color: "#F59E0B", fill: "#F59E0B" }} />}
            {dirty && <span style={{ fontSize: 9, color: "#F59E0B", fontWeight: 700 }}>● unsaved</span>}
          </span>
          <ChevronDown size={12} />
        </button>
        {menuOpen && (
          <div style={dropdownStyle}>
            <div style={dropHeader}>Saved views</div>
            <div
              style={{ ...dropItem, fontWeight: !active ? 700 : 500 }}
              onClick={() => { onSelect(null); setMenuOpen(false); }}
            >
              <span>Default columns</span>
              {!active && <Check size={12} color="var(--brand)" />}
            </div>
            {views.length === 0 && (
              <div style={{ ...dropItem, color: "var(--text3)", fontStyle: "italic", fontSize: 11 }}>
                No saved views yet
              </div>
            )}
            {views.map(v => (
              <div
                key={v.id}
                style={{ ...dropItem, fontWeight: v.id === activeViewId ? 700 : 500 }}
                onClick={() => { onSelect(v.id); setMenuOpen(false); }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {v.name}
                  {v.isDefault && <Star size={10} style={{ color: "#F59E0B", fill: "#F59E0B" }} />}
                </span>
                <div style={{ display: "inline-flex", gap: 2 }}>
                  <button
                    className="icon-btn" title={v.isDefault ? "Default view" : "Set as default"}
                    onClick={(e) => { e.stopPropagation(); onSetDefault(v.id); }}
                  >
                    {v.isDefault ? <Star size={12} color="#F59E0B" fill="#F59E0B" /> : <StarOff size={12} />}
                  </button>
                  <button
                    className="icon-btn" title="Delete view" style={{ color: "#DC2626" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete view "${v.name}"?`)) onDelete(v.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manage columns */}
      <button className="btn-sec" onClick={onOpenColumns} style={btnSm}>
        <Columns3 size={12} /> Columns
      </button>

      {/* Save controls */}
      {active && (
        <button
          className="btn-sec" onClick={onSaveCurrent} disabled={!dirty} style={btnSm}
          title={dirty ? `Save changes to "${active.name}"` : "No changes to save"}
        >
          <Save size={12} /> Save
        </button>
      )}
      <button className="btn-sec" onClick={() => { setNewName(""); setNewDefault(false); setSaveAsOpen(true); }} style={btnSm}>
        <Plus size={12} /> Save as…
      </button>

      {saveAsOpen && (
        <div style={overlayStyle} onClick={() => setSaveAsOpen(false)}>
          <div style={{ ...modalStyle, width: 380 }} onClick={e => e.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Save view as…</div>
              <button className="icon-btn" aria-label="Close" onClick={() => setSaveAsOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>View name</div>
              <input
                autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. My Hot Leads"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 13,
                  border: "1px solid var(--border)", borderRadius: 6,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    onSaveAs(newName.trim(), newDefault);
                    setSaveAsOpen(false);
                  }
                }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12 }}>
                <input type="checkbox" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} />
                Make this my default for this module
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
              <button className="btn-sec" onClick={() => setSaveAsOpen(false)} style={btnSm}>Cancel</button>
              <button
                className="btn-primary" style={btnSm}
                disabled={!newName.trim()}
                onClick={() => { onSaveAs(newName.trim(), newDefault); setSaveAsOpen(false); }}
              >
                <Save size={12} /> Save view
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main DataGrid ───────────────────────────────────────────────────

export default function DataGrid({
  module, userId, columns, defaultColumnConfig, rows,
  rowKey, sortKey, sortDir, onSort,
  rowStyle, selection, rowActions, emptyState, SortIcon,
  onRowClick,
}) {
  const [views, setViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  // Local working copy of column config — not persisted until "Save".
  const [workingConfig, setWorkingConfig] = useState(defaultColumnConfig || []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Initial load of saved views.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadUserTableViews(userId, module);
      if (cancelled) return;
      setViews(list);
      const dflt = list.find(v => v.isDefault);
      if (dflt) {
        setActiveViewId(dflt.id);
        setWorkingConfig(dflt.columnConfig);
      } else {
        setActiveViewId(null);
        setWorkingConfig(defaultColumnConfig || []);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // Only re-run when user/module change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, module]);

  // Resolve which columns to render and in what order.
  const merged = useMemo(() => mergeConfig(workingConfig, columns), [workingConfig, columns]);
  const visible = useMemo(() => merged.filter(c => c.visible), [merged]);

  // Dirty = working config differs from the active saved view (or from
  // the default registry, when no view is selected).
  const dirty = useMemo(() => {
    const persisted = toPersistedConfig(merged);
    const active = views.find(v => v.id === activeViewId);
    const baseline = active ? active.columnConfig : (defaultColumnConfig || []);
    // Fill the baseline so comparison is apples-to-apples (same length).
    const baselineMerged = toPersistedConfig(mergeConfig(baseline, columns));
    return !configsEqual(persisted, baselineMerged);
  }, [merged, views, activeViewId, defaultColumnConfig, columns]);

  // Selecting a saved view replaces the working config wholesale.
  const handleSelect = (viewId) => {
    setActiveViewId(viewId);
    if (viewId === null) {
      setWorkingConfig(defaultColumnConfig || []);
    } else {
      const v = views.find(x => x.id === viewId);
      if (v) setWorkingConfig(v.columnConfig);
    }
  };

  // Apply column-manager changes to the working config (no DB write).
  const handlePickerApply = (newMerged) => {
    setWorkingConfig(toPersistedConfig(newMerged));
  };

  const handleReset = () => {
    setWorkingConfig(defaultColumnConfig || []);
    setActiveViewId(null);
    setPickerOpen(false);
  };

  // Save the working config back to the active view.
  const handleSaveCurrent = async () => {
    const active = views.find(v => v.id === activeViewId);
    if (!active) return;
    const saved = await saveUserTableView({
      userId, module, name: active.name,
      columnConfig: toPersistedConfig(merged),
      isDefault: active.isDefault,
    });
    if (saved && !saved.error) {
      setViews(prev => prev.map(v => v.id === active.id ? saved : v));
      setActiveViewId(saved.id);
    }
  };

  // Save the working config as a new view.
  const handleSaveAs = async (name, asDefault) => {
    const saved = await saveUserTableView({
      userId, module, name,
      columnConfig: toPersistedConfig(merged),
      isDefault: !!asDefault,
    });
    if (saved && !saved.error) {
      // Re-fetch to pick up trigger-driven default flips.
      const list = await loadUserTableViews(userId, module);
      setViews(list);
      setActiveViewId(saved.id);
    }
  };

  const handleSetDefault = async (viewId) => {
    await setDefaultUserTableView(viewId, userId, module);
    const list = await loadUserTableViews(userId, module);
    setViews(list);
  };

  const handleDelete = async (viewId) => {
    await deleteUserTableView(viewId, userId, module);
    const list = await loadUserTableViews(userId, module);
    setViews(list);
    if (activeViewId === viewId) {
      const dflt = list.find(v => v.isDefault);
      if (dflt) { setActiveViewId(dflt.id); setWorkingConfig(dflt.columnConfig); }
      else { setActiveViewId(null); setWorkingConfig(defaultColumnConfig || []); }
    }
  };

  // Column-resize via drag handle on the right edge of each <th>.
  const resizingRef = useRef(null);
  useEffect(() => {
    const onMove = (e) => {
      const r = resizingRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const next = Math.max(60, Math.min(800, r.startWidth + dx));
      setWorkingConfig(prev => {
        // Walk the merged list to find the column we're sizing, edit its
        // width, then dump back to persisted shape so the working config
        // stays a flat array of {key, visible, width}.
        const m = mergeConfig(prev, columns).map(c =>
          c.key === r.key ? { ...c, width: next } : c
        );
        return toPersistedConfig(m);
      });
    };
    const onUp = () => { resizingRef.current = null; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [columns]);

  const startResize = (e, key, currentWidth) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: currentWidth || 140 };
    document.body.style.cursor = "col-resize";
  };

  return (
    <div>
      {/* Toolbar — saved views, columns, save controls */}
      <div style={{
        display: "flex", justifyContent: "flex-end",
        padding: "8px 12px", borderBottom: "1px solid var(--border)",
        background: "var(--s2)",
      }}>
        <SavedViewsBar
          views={views} activeViewId={activeViewId} dirty={dirty}
          onSelect={handleSelect}
          onSaveCurrent={handleSaveCurrent}
          onSaveAs={handleSaveAs}
          onSetDefault={handleSetDefault}
          onDelete={handleDelete}
          onOpenColumns={() => setPickerOpen(true)}
        />
      </div>

      {/* Table */}
      <div className="tbl-scroll" style={{ maxHeight: "calc(100vh - 280px)", overflow: "auto" }}>
        <table className="tbl" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--surface)" }}>
            <tr>
              {selection && (
                <th style={{ width: 36, position: "sticky", left: 0, background: "var(--surface)", zIndex: 3 }}>
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
              )}
              {visible.map(c => {
                const sortable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    style={{
                      width: c.width, minWidth: c.width, maxWidth: c.width,
                      position: "relative",
                      cursor: sortable ? "pointer" : "default",
                      userSelect: "none",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                    onClick={() => sortable && onSort && onSort(c.key)}
                    title={c.label}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {c.label}
                      {sortable && SortIcon && <SortIcon col={c.key} sortKey={sortKey} sortDir={sortDir} />}
                    </span>
                    <span
                      onMouseDown={(e) => startResize(e, c.key, c.width)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute", right: 0, top: 0, bottom: 0, width: 6,
                        cursor: "col-resize", userSelect: "none",
                      }}
                    />
                  </th>
                );
              })}
              {rowActions && <th style={{ width: 110 }}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={rowKey(r)}
                style={rowStyle ? rowStyle(r) : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {selection && (
                  <td style={{ position: "sticky", left: 0, background: "var(--surface)" }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selection.isSelected(rowKey(r))}
                      onChange={() => selection.toggle(rowKey(r))}
                    />
                  </td>
                )}
                {visible.map(c => (
                  <td
                    key={c.key}
                    style={{
                      width: c.width, minWidth: c.width, maxWidth: c.width,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
                {rowActions && <td onClick={e => e.stopPropagation()}>{rowActions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && emptyState}
        {!loaded && rows.length > 0 && (
          <div style={{ padding: 8, fontSize: 11, color: "var(--text3)", textAlign: "center" }}>
            Loading saved views…
          </div>
        )}
      </div>

      {pickerOpen && (
        <ColumnManager
          merged={merged}
          onChange={handlePickerApply}
          onClose={() => setPickerOpen(false)}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

// ── Inline styles (kept local; extracting to styles.js is cosmetic) ─

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle = {
  width: 520, maxWidth: "90vw", background: "var(--surface)",
  borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  display: "flex", flexDirection: "column",
};
const modalHeader = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 16px", borderBottom: "1px solid var(--border)",
};
const btnSm = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "6px 10px", fontSize: 12, fontWeight: 600,
  borderRadius: 6,
};
const dropdownStyle = {
  position: "absolute", top: "calc(100% + 4px)", left: 0,
  width: 280, maxHeight: 360, overflowY: "auto",
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 8, boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
  zIndex: 200, padding: 4,
};
const dropHeader = {
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  color: "var(--text3)", padding: "6px 10px", letterSpacing: "0.06em",
};
const dropItem = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 10px", fontSize: 12, borderRadius: 6,
  cursor: "pointer",
};

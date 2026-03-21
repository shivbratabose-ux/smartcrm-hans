import { useState } from "react";
import { CheckSquare, Trash2, Download, X } from "lucide-react";

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

export default function BulkActions({ count, onDelete, onExport, onClear }) {
  if (count === 0) return null;
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12, padding:"8px 16px",
      background:"var(--brand-bg)", borderRadius:8, marginBottom:12,
      border:"1px solid var(--brand)", fontSize:13
    }}>
      <CheckSquare size={16} style={{color:"var(--brand)"}}/>
      <span style={{fontWeight:600,color:"var(--brand)"}}>{count} selected</span>
      <div style={{flex:1}}/>
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

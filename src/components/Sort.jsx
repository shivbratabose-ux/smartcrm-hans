// ─── Sortable column hook + header cell ──────────────────────────────────────
// Pairs with usePagination — call useSort BEFORE usePagination so paging
// is computed against the sorted list, not the unsorted source.
//
// Usage:
//   const sort   = useSort("createdAt", "desc");
//   const sorted = useMemo(() => sort.apply(filtered), [filtered, sort.key, sort.dir]);
//   const pg     = usePagination(sorted);
//   ...
//   <th><SortHeader sort={sort} k="company">Company</SortHeader></th>
//   <th><SortHeader sort={sort} k="value" align="right">Value</SortHeader></th>

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export function useSort(initialKey = null, initialDir = "asc") {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState(initialDir);

  const toggle = (k) => {
    if (k === key) {
      setDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setKey(k);
      setDir("asc");
    }
  };

  // Generic comparator: numbers numerically, dates by parsed Date,
  // strings via localeCompare (case-insensitive). Nullish always sorts last.
  const apply = (items) => {
    if (!key || !Array.isArray(items)) return items || [];
    const factor = dir === "asc" ? 1 : -1;
    const arr = [...items];
    arr.sort((a, b) => {
      const av = a?.[key];
      const bv = b?.[key];
      const aN = av == null || av === "";
      const bN = bv == null || bv === "";
      if (aN && bN) return 0;
      if (aN) return 1;   // nulls always last
      if (bN) return -1;

      // Numeric
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      // ISO date strings
      if (typeof av === "string" && /^\d{4}-\d{2}-\d{2}/.test(av) &&
          typeof bv === "string" && /^\d{4}-\d{2}-\d{2}/.test(bv)) {
        return av.localeCompare(bv) * factor;
      }
      // Fallback to string compare
      return String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * factor;
    });
    return arr;
  };

  return { key, dir, toggle, apply };
}

export function SortHeader({ sort, k, children, align = "left" }) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={() => sort.toggle(k)}
      aria-label={`Sort by ${typeof children === "string" ? children : k}${active ? ` (${sort.dir})` : ""}`}
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        margin: 0,
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
        textAlign: align,
      }}
    >
      <span>{children}</span>
      <Icon size={12} style={{ opacity: active ? 1 : 0.4, flexShrink: 0 }} />
    </button>
  );
}

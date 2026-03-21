import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZES = [10, 25, 50, 100];

export function usePagination(items, initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  const goTo = (p) => setPage(Math.max(1, Math.min(p, totalPages)));
  const changeSize = (s) => { setPageSize(s); setPage(1); };

  return { paged, page: safePage, pageSize, totalPages, total: items.length, goTo, changeSize, start };
}

export default function Pagination({ page, pageSize, totalPages, total, start, goTo, changeSize }) {
  if (total <= 10) return null;
  const end = Math.min(start + pageSize, total);

  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"10px 16px", borderTop:"1px solid var(--border)", fontSize:12, color:"var(--text3)"
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span>Rows per page:</span>
        <select value={pageSize} onChange={e=>changeSize(+e.target.value)}
          style={{fontSize:12,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--surface)",cursor:"pointer"}}>
          {PAGE_SIZES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span>{start+1}–{end} of {total}</span>
        <div style={{display:"flex",gap:4}}>
          <button className="icon-btn" onClick={()=>goTo(page-1)} disabled={page<=1}
            aria-label="Previous page" style={{opacity:page<=1?0.3:1}}>
            <ChevronLeft size={16}/>
          </button>
          {totalPages <= 7 ? (
            Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
              <button key={p} onClick={()=>goTo(p)}
                style={{
                  minWidth:28, height:28, borderRadius:6, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:p===page?700:400,
                  background:p===page?"var(--brand)":"transparent",
                  color:p===page?"white":"var(--text2)"
                }}>{p}</button>
            ))
          ) : (
            <>
              {[1, page > 3 ? "..." : 2, page > 3 ? page-1 : 3, page > 3 && page < totalPages-2 ? page : null,
                page < totalPages-2 ? page+1 : totalPages-2, page < totalPages-2 ? "..." : totalPages-1, totalPages]
                .filter((v,i,a)=>v!==null && a.indexOf(v)===i)
                .map((p,i)=> typeof p==="string" ? (
                  <span key={i} style={{padding:"0 4px"}}>…</span>
                ) : (
                  <button key={p} onClick={()=>goTo(p)}
                    style={{
                      minWidth:28, height:28, borderRadius:6, border:"none", cursor:"pointer",
                      fontSize:12, fontWeight:p===page?700:400,
                      background:p===page?"var(--brand)":"transparent",
                      color:p===page?"white":"var(--text2)"
                    }}>{p}</button>
                ))}
            </>
          )}
          <button className="icon-btn" onClick={()=>goTo(page+1)} disabled={page>=totalPages}
            aria-label="Next page" style={{opacity:page>=totalPages?0.3:1}}>
            <ChevronRight size={16}/>
          </button>
        </div>
      </div>
    </div>
  );
}

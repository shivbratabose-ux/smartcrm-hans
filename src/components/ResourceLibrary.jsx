// ═══════════════════════════════════════════════════════════════════
// ResourceLibrary — sales collateral organised per product (URL-only)
// ═══════════════════════════════════════════════════════════════════
// Mounted as a tab inside the Communications module. Lets curators
// (admin / md / director / vp_sales_mkt / line_mgr / country_mgr) add
// and edit links to presentations, brochures, pricing decks, etc.
// hosted on Drive / Dropbox / SharePoint. Reps browse + filter by
// product / kind / search, and the same library is also surfaced
// inside SendEmailModal so they can attach links into outbound emails.
//
// "URL-only" — see supabase/product_resources_v1.sql for why we don't
// store the file bytes. The key consequence here: there's no upload
// progress, no preview, no signed URL — just a name + a clickable
// link. That mirrors how Quotations.attachments and files.url already
// work in this codebase.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Edit2, Trash2, ExternalLink, Download, Copy,
  FileText, Image, Presentation, DollarSign, Video, Layers, X, Check,
} from "lucide-react";
import { Modal, FormError, Empty, ProdTag, UserPill } from "./shared";
import { fmt } from "../utils/helpers";
import {
  loadProductResources, saveProductResource, deleteProductResource,
} from "../lib/db";

// Controlled vocabulary for the kind picker. Stored as TEXT in the DB.
// Keep the icons here so list cards and the upload modal share them.
export const RESOURCE_KINDS = [
  { value: "Presentation",    icon: Presentation, color: "#6366F1" },
  { value: "Product Details", icon: FileText,     color: "#1B6B5A" },
  { value: "Pricing",         icon: DollarSign,   color: "#16A34A" },
  { value: "Brochure",        icon: Image,        color: "#F59E0B" },
  { value: "Datasheet",       icon: Layers,       color: "#3B82F6" },
  { value: "Demo Video",      icon: Video,        color: "#DC2626" },
  { value: "Case Study",      icon: FileText,     color: "#8B5CF6" },
  { value: "Other",           icon: FileText,     color: "#64748B" },
];
const KIND_META = Object.fromEntries(RESOURCE_KINDS.map(k => [k.value, k]));

// Loose URL validation — the field is free-text on purpose so we accept
// signed/expiring URLs from any provider. Just block obviously-non-URL
// pastes ("the brochure", empty strings) at form submit time.
const isValidUrl = (s) => {
  if (!s) return false;
  try { const u = new URL(s); return !!u.protocol && /^https?:$/.test(u.protocol); }
  catch { return false; }
};

// Whether the current user can curate (add / edit / delete) resources.
// Mirrors the Postgres RLS policy in product_resources_v1.sql so the UI
// and the DB agree on who's allowed.
const CURATOR_ROLES = new Set([
  "admin", "md", "director", "vp_sales_mkt", "line_mgr", "country_mgr",
]);
const isCurator = (orgUsers, currentUser) => {
  const me = orgUsers?.find?.(u => u.id === currentUser);
  return !!me && CURATOR_ROLES.has(me.role);
};

export default function ResourceLibrary({ catalog = [], orgUsers = [], currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productF, setProductF] = useState("All");
  const [kindF, setKindF] = useState("All");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);   // { mode: 'add' | 'edit', record? }
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState("");

  const canCurate = isCurator(orgUsers, currentUser);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadProductResources();
      if (!cancelled) { setRows(list); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build a stable products list from the org catalog plus any
  // resources whose product_id is no longer in the catalog (orphans —
  // shown so curators can clean them up).
  const products = useMemo(() => {
    const fromCatalog = (catalog || []).map(p => ({ id: p.id, name: p.name || p.id }));
    const known = new Set(fromCatalog.map(p => p.id));
    const orphans = rows
      .map(r => r.productId)
      .filter(pid => pid && !known.has(pid))
      .map(pid => ({ id: pid, name: pid + " (legacy)" }));
    return [...fromCatalog, ...new Map(orphans.map(o => [o.id, o])).values()];
  }, [catalog, rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (productF !== "All" && r.productId !== productF) return false;
    if (kindF !== "All" && r.kind !== kindF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.name + r.description + r.kind + r.version).toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, productF, kindF, search]);

  // Group filtered rows by product for the card grid.
  const byProduct = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const k = r.productId || "_unassigned";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }, [filtered]);

  const handleSave = async (form) => {
    const saved = await saveProductResource(form);
    if (saved && !saved.error) {
      setRows(p => {
        const without = p.filter(r => r.id !== saved.id);
        return [saved, ...without];
      });
      setModal(null);
      setToast(form.id ? "Resource updated." : "Resource added.");
    } else {
      setToast(`Save failed: ${saved?.error?.message || saved?.error || "unknown"}`);
    }
    setTimeout(() => setToast(""), 2400);
  };

  const handleDelete = async (id) => {
    const { error } = await deleteProductResource(id);
    if (!error) setRows(p => p.filter(r => r.id !== id));
    setConfirm(null);
    setToast(error ? `Delete failed: ${error.message || error}` : "Resource removed.");
    setTimeout(() => setToast(""), 2400);
  };

  const copyLink = (url) => {
    navigator.clipboard?.writeText(url);
    setToast("Link copied to clipboard.");
    setTimeout(() => setToast(""), 1800);
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
        <div className="filter-search" style={{maxWidth:240}}>
          <Search size={14} style={{color:"var(--text3)",flexShrink:0}}/>
          <input placeholder="Search resources…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="filter-select" value={productF} onChange={e => setProductF(e.target.value)}>
          <option value="All">All Products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="filter-select" value={kindF} onChange={e => setKindF(e.target.value)}>
          <option value="All">All Kinds</option>
          {RESOURCE_KINDS.map(k => <option key={k.value} value={k.value}>{k.value}</option>)}
        </select>
        <div style={{flex:1}}/>
        {canCurate && (
          <button className="btn btn-primary" onClick={() => setModal({ mode: "add" })}>
            <Plus size={14}/>Add Resource
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{padding:40,textAlign:"center",color:"var(--text3)",fontSize:13}}>Loading library…</div>
      ) : filtered.length === 0 ? (
        <Empty
          icon={<FileText size={22}/>}
          title="No resources found"
          sub={canCurate ? "Add the first presentation, brochure, or pricing deck." : "Ask your line manager to add resources for this product."}
        />
      ) : (
        <div style={{display:"grid",gap:14}}>
          {[...byProduct.entries()].map(([pid, list]) => {
            const prod = products.find(p => p.id === pid);
            return (
              <div key={pid} className="card" style={{padding:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:10,borderBottom:"1px solid var(--border)"}}>
                  {pid === "_unassigned"
                    ? <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Unassigned</span>
                    : <ProdTag pid={pid}/>}
                  <span style={{fontSize:13,fontWeight:700}}>{prod?.name || pid}</span>
                  <span style={{fontSize:11,color:"var(--text3)",marginLeft:"auto"}}>{list.length} item{list.length === 1 ? "" : "s"}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
                  {list.map(r => {
                    const meta = KIND_META[r.kind] || KIND_META["Other"];
                    const Icon = meta.icon;
                    return (
                      <div key={r.id} style={{
                        border:"1px solid var(--border)", borderRadius:8, padding:12,
                        background:"var(--surface)", display:"flex", gap:10,
                      }}>
                        <div style={{
                          width:36,height:36,borderRadius:8,flexShrink:0,
                          background:meta.color+"18",color:meta.color,
                          display:"flex",alignItems:"center",justifyContent:"center",
                        }}>
                          <Icon size={18}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12.5,fontWeight:600,color:"var(--text1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.name}>{r.name}</div>
                          <div style={{fontSize:10,color:"var(--text3)",marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                            <span style={{padding:"1px 6px",borderRadius:3,background:meta.color+"14",color:meta.color,fontWeight:600}}>{r.kind}</span>
                            {r.version && <span>· v{r.version}</span>}
                            {r.updatedAt && <span>· {fmt.short(r.updatedAt.slice(0,10))}</span>}
                          </div>
                          {r.description && (
                            <div style={{fontSize:11,color:"var(--text2)",marginTop:6,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{r.description}</div>
                          )}
                          <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn-sec btn-sm" style={{fontSize:11,padding:"4px 8px"}} title={r.url}>
                              <ExternalLink size={11}/>Open
                            </a>
                            <button className="btn btn-sec btn-sm" style={{fontSize:11,padding:"4px 8px"}} onClick={() => copyLink(r.url)} title="Copy link">
                              <Copy size={11}/>Copy
                            </button>
                            {canCurate && (
                              <>
                                <button className="icon-btn" aria-label="Edit" onClick={() => setModal({ mode: "edit", record: r })}><Edit2 size={13}/></button>
                                <button className="icon-btn" aria-label="Delete" style={{color:"#DC2626"}} onClick={() => setConfirm(r)}><Trash2 size={13}/></button>
                              </>
                            )}
                          </div>
                          {r.uploadedBy && (
                            <div style={{fontSize:10,color:"var(--text3)",marginTop:6}}>
                              Added by <UserPill uid={r.uploadedBy} compact/>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ResourceModal
          mode={modal.mode}
          record={modal.record}
          products={products.length ? products : (catalog || []).map(p => ({ id: p.id, name: p.name || p.id }))}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {confirm && (
        <Modal title="Remove resource" onClose={() => setConfirm(null)}
          footer={<>
            <button className="btn btn-sec" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn" style={{background:"#DC2626",color:"white"}} onClick={() => handleDelete(confirm.id)}>
              <Trash2 size={13}/>Remove
            </button>
          </>}>
          <div style={{fontSize:13}}>Remove "<strong>{confirm.name}</strong>" from the library? The underlying file at the linked URL is not affected.</div>
        </Modal>
      )}

      {toast && (
        <div style={{
          position:"fixed",bottom:24,right:24,padding:"10px 14px",
          background:"var(--text1)",color:"white",borderRadius:8,
          fontSize:12.5,boxShadow:"0 8px 24px rgba(0,0,0,0.18)",zIndex:1500,
        }}>{toast}</div>
      )}
    </div>
  );
}

// ── ResourceModal — add / edit a resource entry ─────────────────────

function ResourceModal({ mode, record, products, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    id: record?.id || undefined,
    productId: record?.productId || (products[0]?.id || ""),
    kind: record?.kind || RESOURCE_KINDS[0].value,
    name: record?.name || "",
    url: record?.url || "",
    version: record?.version || "",
    description: record?.description || "",
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.productId) e.productId = "Pick a product";
    if (!form.kind)      e.kind = "Pick a kind";
    if (!form.name?.trim()) e.name = "Name is required";
    if (!form.url?.trim()) e.url = "URL is required";
    else if (!isValidUrl(form.url.trim())) e.url = "Must be a valid http(s) URL";
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    await onSave({
      ...form,
      name: form.name.trim(),
      url: form.url.trim(),
      version: form.version.trim(),
      description: form.description.trim(),
    });
    setSaving(false);
  };

  return (
    <Modal
      title={mode === "edit" ? "Edit resource" : "Add resource"}
      onClose={onClose}
      footer={<>
        <button className="btn btn-sec" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          <Check size={13}/>{saving ? "Saving…" : "Save"}
        </button>
      </>}
    >
      <div className="form-row">
        <div className="form-group">
          <label>Product *</label>
          <select value={form.productId} onChange={e => { setForm(f => ({...f, productId: e.target.value})); setErrors(x => ({...x, productId: undefined})); }} style={errors.productId ? {borderColor:"#DC2626"} : {}}>
            {products.length === 0 && <option value="">No products in catalog</option>}
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <FormError error={errors.productId}/>
        </div>
        <div className="form-group">
          <label>Kind *</label>
          <select value={form.kind} onChange={e => setForm(f => ({...f, kind: e.target.value}))}>
            {RESOURCE_KINDS.map(k => <option key={k.value} value={k.value}>{k.value}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row full">
        <div className="form-group">
          <label>Name *</label>
          <input
            value={form.name}
            onChange={e => { setForm(f => ({...f, name: e.target.value})); setErrors(x => ({...x, name: undefined})); }}
            placeholder="e.g. iCAFFE Q3 Investor Deck"
            style={errors.name ? {borderColor:"#DC2626"} : {}}
          />
          <FormError error={errors.name}/>
        </div>
      </div>
      <div className="form-row full">
        <div className="form-group">
          <label>URL *</label>
          <input
            value={form.url}
            onChange={e => { setForm(f => ({...f, url: e.target.value})); setErrors(x => ({...x, url: undefined})); }}
            placeholder="https://drive.google.com/… or https://…sharepoint.com/…"
            style={errors.url ? {borderColor:"#DC2626"} : {}}
          />
          <FormError error={errors.url}/>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
            Paste a shareable link from Google Drive, Dropbox, SharePoint, or any HTTPS URL. Make sure recipients have permission to open it before sending.
          </div>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Version</label>
          <input value={form.version} onChange={e => setForm(f => ({...f, version: e.target.value}))} placeholder="v2 / Q3-2026 / Final"/>
        </div>
      </div>
      <div className="form-row full">
        <div className="form-group">
          <label>Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={e => setForm(f => ({...f, description: e.target.value}))}
            placeholder="What's in this resource? When should reps use it?"
          />
        </div>
      </div>
    </Modal>
  );
}

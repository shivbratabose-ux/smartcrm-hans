import { useState, useMemo } from "react";
import {
  Plus, Bell, Search, Check, X, Edit2, Archive,
  Paperclip, Tag, Users, Globe, User, Megaphone,
  FileText, AlertCircle, Info, BarChart3
} from "lucide-react";
import { INIT_USERS, TEAM_MAP } from '../data/constants';
import {
  UPDATE_CATEGORIES, UPDATE_ATTACHMENT_TYPES, PERMISSIONS_UPDATES
} from '../data/constants';
import { uid } from '../utils/helpers';
import { Modal, Confirm, HelpTooltip, PageTip } from './shared';

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const PRI_CFG = {
  Critical: { color:"#DC2626", bg:"#FEF2F2" },
  High:     { color:"#D97706", bg:"#FFFBEB" },
  Medium:   { color:"#2563EB", bg:"#EFF6FF" },
  Low:      { color:"#64748B", bg:"#F8FAFC" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day:"numeric", month:"short" });
}

function expandRecipients(mode, recipientUserIds, orgUsers) {
  const all = orgUsers || INIT_USERS;
  if (mode === "org") return all.map(u => u.id);
  if (mode === "specific") return recipientUserIds || [];
  return all.map(u => u.id); // fallback
}

// ══════════════════════════════════════════════════════════════
// FEED CARD
// ══════════════════════════════════════════════════════════════
function UpdateFeedCard({ upd, isSelected, isUnread, currentUser, orgUsers, onClick }) {
  const author = (orgUsers || INIT_USERS).find(u => u.id === upd.createdBy) || TEAM_MAP[upd.createdBy];
  const priCfg = PRI_CFG[upd.priority] || PRI_CFG.Medium;

  return (
    <div className={`upd-card${isSelected ? " selected" : ""}${isUnread ? " unread" : ""}`} onClick={onClick}>
      <div className="upd-card-top">
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background: isUnread ? priCfg.color : "var(--border2)", flexShrink:0, display:"inline-block" }}/>
          <span className="upd-cat-tag">{upd.category}</span>
          <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4, background:priCfg.bg, color:priCfg.color }}>{upd.priority}</span>
        </div>
        <span style={{ fontSize:11, color:"var(--text3)", flexShrink:0 }}>{timeAgo(upd.createdAt)}</span>
      </div>
      <div className="upd-card-title" style={{ fontWeight: isUnread ? 700 : 500 }}>{upd.title}</div>
      <div className="upd-card-preview">
        {(upd.description || "").replace(/\n/g," ").slice(0,110)}
        {(upd.description || "").length > 110 ? "…" : ""}
      </div>
      <div className="upd-card-foot">
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <div style={{ width:18, height:18, fontSize:8, borderRadius:5, background:"var(--brand)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, flexShrink:0 }}>
            {author?.initials || "?"}
          </div>
          <span style={{ fontSize:11, color:"var(--text3)" }}>{author?.name?.split(" ")[0] || "Unknown"}</span>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {(upd.attachments?.length > 0) && (
            <span style={{ fontSize:11, color:"var(--text3)", display:"flex", alignItems:"center", gap:2 }}>
              <Paperclip size={10}/>{upd.attachments.length}
            </span>
          )}
          {(upd.tags?.length > 0) && (
            <span style={{ fontSize:11, color:"var(--text3)", display:"flex", alignItems:"center", gap:2 }}>
              <Tag size={10}/>{upd.tags.length}
            </span>
          )}
          <span style={{ fontSize:11, fontWeight:600, color: isUnread ? "var(--brand)" : "var(--text3)" }}>
            {isUnread ? "● Unread" : "✓ Read"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// READ TRACKING TABLE
// ══════════════════════════════════════════════════════════════
function ReadTrackingTable({ upd, orgUsers }) {
  const allUsers = orgUsers || INIT_USERS;
  const recipients = upd.recipientUserIds || [];
  const readStatus = upd.readStatus || {};
  const readCount = recipients.filter(id => readStatus[id] === "read").length;
  const unreadCount = recipients.length - readCount;

  return (
    <div style={{ marginTop:4 }}>
      <div style={{ display:"flex", gap:10, marginBottom:12 }}>
        <div style={{ flex:1, background:"var(--green-bg)", borderRadius:8, padding:"10px 14px" }}>
          <div style={{ fontSize:22, fontWeight:800, color:"var(--green)" }}>{readCount}</div>
          <div style={{ fontSize:11, color:"var(--green-t)", fontWeight:600 }}>Read</div>
        </div>
        <div style={{ flex:1, background:"var(--amber-bg)", borderRadius:8, padding:"10px 14px" }}>
          <div style={{ fontSize:22, fontWeight:800, color:"var(--amber)" }}>{unreadCount}</div>
          <div style={{ fontSize:11, color:"var(--amber-t)", fontWeight:600 }}>Pending</div>
        </div>
        <div style={{ flex:1, background:"var(--s3)", borderRadius:8, padding:"10px 14px" }}>
          <div style={{ fontSize:22, fontWeight:800, color:"var(--text2)" }}>{recipients.length}</div>
          <div style={{ fontSize:11, color:"var(--text3)", fontWeight:600 }}>Total</div>
        </div>
      </div>
      <div style={{ maxHeight:220, overflowY:"auto" }}>
        {recipients.length === 0 && (
          <div style={{ fontSize:12, color:"var(--text3)", padding:"8px 0" }}>No recipients assigned.</div>
        )}
        {recipients.map(userId => {
          const u = allUsers.find(x => x.id === userId) || TEAM_MAP[userId];
          const isRead = readStatus[userId] === "read";
          return (
            <div key={userId} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
              <div style={{ width:26, height:26, fontSize:9, borderRadius:7, background:"var(--brand)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, flexShrink:0 }}>
                {u?.initials || "?"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12.5, fontWeight:500 }}>{u?.name || userId}</div>
                <div style={{ fontSize:11, color:"var(--text3)" }}>{u?.role || ""}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color: isRead ? "var(--green)" : "var(--amber)", background: isRead ? "var(--green-bg)" : "var(--amber-bg)", padding:"2px 8px", borderRadius:20 }}>
                {isRead ? "✓ Read" : "Pending"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DETAIL PANEL
// ══════════════════════════════════════════════════════════════
function UpdateDetailPanel({ upd, currentUser, orgUsers, onClose, onEdit, onArchive, canEdit, canManage }) {
  const [tab, setTab] = useState("content");
  const author = (orgUsers || INIT_USERS).find(u => u.id === upd.createdBy) || TEAM_MAP[upd.createdBy];
  const priCfg = PRI_CFG[upd.priority] || PRI_CFG.Medium;
  const allUsers = orgUsers || INIT_USERS;

  return (
    <div className="upd-detail">
      {/* Head */}
      <div className="upd-detail-head">
        <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
          <span className="upd-cat-tag">{upd.category}</span>
          <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:5, background:priCfg.bg, color:priCfg.color }}>{upd.priority}</span>
          {upd.archived && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:"var(--s3)", color:"var(--text3)" }}>Archived</span>}
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
          {canEdit && !upd.archived && (
            <button className="btn btn-sec btn-xs" onClick={onEdit}><Edit2 size={11}/>Edit</button>
          )}
          {canManage && !upd.archived && (
            <button className="btn btn-sec btn-xs" onClick={() => onArchive(upd.id)}>
              <Archive size={11}/>Archive
            </button>
          )}
          <button className="icon-btn" onClick={onClose}><X size={15}/></button>
        </div>
      </div>

      {/* Title & meta */}
      <div style={{ padding:"16px 20px 0" }}>
        <div className="upd-detail-title">{upd.title}</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:8, marginBottom:10, alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:20, height:20, fontSize:9, borderRadius:5, background:"var(--brand)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>
              {author?.initials || "?"}
            </div>
            <span style={{ fontSize:12, color:"var(--text2)", fontWeight:600 }}>{author?.name || "Unknown"}</span>
          </div>
          <span style={{ fontSize:12, color:"var(--text3)" }}>
            {new Date(upd.createdAt).toLocaleString("en-IN", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}
          </span>
          {upd.updateId && <span style={{ fontSize:11, color:"var(--text3)", background:"var(--s3)", padding:"1px 7px", borderRadius:4 }}>{upd.updateId}</span>}
          {upd.editHistory?.length > 0 && (
            <span style={{ fontSize:11, color:"var(--text3)", fontStyle:"italic" }}>(edited {upd.editHistory.length}×)</span>
          )}
        </div>
        {upd.tags?.length > 0 && (
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:12 }}>
            {upd.tags.map(t => (
              <span key={t} style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"var(--brand-bg)", color:"var(--brand)", fontWeight:600 }}>#{t}</span>
            ))}
          </div>
        )}
        {upd.taggedUserIds?.length > 0 && (
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
            {upd.taggedUserIds.map(uid2 => {
              const u = allUsers.find(x => x.id === uid2) || TEAM_MAP[uid2];
              return (
                <span key={uid2} style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"var(--s3)", color:"var(--text2)" }}>
                  @{u?.name?.split(" ")[0] || uid2}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display:"flex", padding:"0 20px", borderBottom:"1px solid var(--border)" }}>
        {[["content","Content"],["tracking","Read Tracking"]].map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:"8px 14px", fontSize:12, fontWeight:600, border:"none",
              borderBottom: tab === t ? "2px solid var(--brand)" : "2px solid transparent",
              background:"transparent", cursor:"pointer",
              color: tab === t ? "var(--brand)" : "var(--text3)" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding:"16px 20px", overflowY:"auto", flex:1 }}>
        {tab === "content" && (
          <>
            <div style={{ fontSize:13.5, lineHeight:1.75, color:"var(--text)", whiteSpace:"pre-wrap" }}>
              {upd.description || <span style={{ color:"var(--text3)", fontStyle:"italic" }}>No content.</span>}
            </div>
            {upd.attachments?.length > 0 && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--text3)", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Attachments</div>
                {upd.attachments.map((a, i) => (
                  <a key={i} href={a.url || "#"} target="_blank" rel="noopener noreferrer"
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:7, background:"var(--s2)", marginBottom:5, fontSize:12.5, color:"var(--text)", textDecoration:"none", border:"1px solid var(--border)" }}>
                    <Paperclip size={12} style={{ color:"var(--brand)" }}/>
                    <span style={{ flex:1 }}>{a.name}</span>
                    <span style={{ fontSize:10, color:"var(--text3)", padding:"1px 6px", borderRadius:4, background:"var(--s3)" }}>{a.type}</span>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "tracking" && <ReadTrackingTable upd={upd} orgUsers={orgUsers}/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CREATE / EDIT MODAL
// ══════════════════════════════════════════════════════════════
const BLANK_FORM = {
  title:"", category:"Announcement", priority:"Medium", description:"",
  recipientMode:"org", recipientUserIds:[], taggedUserIds:[],
  tags:"", attachments:[],
};

function CreateUpdateModal({ form, setForm, onSave, onClose, orgUsers, editMode }) {
  const [newAtt, setNewAtt] = useState({ name:"", type:"PDF", url:"" });
  const allUsers = orgUsers || INIT_USERS;
  const set = (k, v) => setForm(f => ({ ...f, [k]:v }));

  const addAtt = () => {
    if (!newAtt.name.trim()) return;
    set("attachments", [...(form.attachments || []), { ...newAtt }]);
    setNewAtt({ name:"", type:"PDF", url:"" });
  };

  const toggleUser = id => {
    const ids = form.recipientUserIds || [];
    set("recipientUserIds", ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const toggleTagged = id => {
    const ids = form.taggedUserIds || [];
    set("taggedUserIds", ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  return (
    <Modal
      title={editMode ? "Edit Update" : "Post New Update"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-sec" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave}>
            <Check size={14}/>{editMode ? "Save Changes" : "Post Update"}
          </button>
        </>
      }
    >
      <div className="form-row full">
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Clear, concise title for this update…"/>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Category</label>
          <select value={form.category} onChange={e => set("category", e.target.value)}>
            {UPDATE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select value={form.priority} onChange={e => set("priority", e.target.value)}>
            {["Critical","High","Medium","Low"].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Content *</label>
        <textarea value={form.description} onChange={e => set("description", e.target.value)}
          rows={6} placeholder="Write the full update content here. Use line breaks for structure."/>
      </div>

      <div className="form-group">
        <label>Tags <span style={{ fontWeight:400, color:"var(--text3)" }}>(comma separated)</span></label>
        <input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="e.g. q1, sales, policy"/>
      </div>

      <div className="form-group">
        <label style={{ display:"inline-flex", alignItems:"center" }}>
          Recipients
          <HelpTooltip text="'Entire Org' sends to all active users. 'Specific Users' lets you handpick recipients. The Read Tracking tab shows who has viewed the update." width={250}/>
        </label>
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          {[["org","🌐 Entire Org"],["specific","👤 Specific Users"]].map(([m, lbl]) => (
            <button key={m} className={`btn btn-xs ${form.recipientMode === m ? "btn-primary" : "btn-sec"}`}
              onClick={() => set("recipientMode", m)}>
              {lbl}
            </button>
          ))}
        </div>
        {form.recipientMode === "specific" && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"10px 12px", background:"var(--s2)", borderRadius:8, border:"1px solid var(--border)" }}>
            {allUsers.map(u => (
              <label key={u.id} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12.5, cursor:"pointer" }}>
                <input type="checkbox" checked={(form.recipientUserIds || []).includes(u.id)} onChange={() => toggleUser(u.id)}/>
                {u.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Tag / Mention Users</label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"10px 12px", background:"var(--s2)", borderRadius:8, border:"1px solid var(--border)" }}>
          {allUsers.map(u => (
            <label key={u.id} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12.5, cursor:"pointer" }}>
              <input type="checkbox" checked={(form.taggedUserIds || []).includes(u.id)} onChange={() => toggleTagged(u.id)}/>
              @{u.name.split(" ")[0]}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Attachments</label>
        {(form.attachments || []).map((a, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"var(--s2)", borderRadius:6, marginBottom:4, fontSize:12 }}>
            <Paperclip size={11} style={{ color:"var(--brand)", flexShrink:0 }}/>
            <span style={{ flex:1 }}>{a.name}</span>
            <span style={{ fontSize:10, color:"var(--text3)", padding:"1px 6px", borderRadius:4, background:"var(--s3)" }}>{a.type}</span>
            <button className="icon-btn" onClick={() => set("attachments", form.attachments.filter((_,j)=>j!==i))}><X size={11}/></button>
          </div>
        ))}
        <div style={{ display:"flex", gap:6, marginTop:6 }}>
          <input value={newAtt.name} onChange={e => setNewAtt(n => ({...n, name:e.target.value}))}
            placeholder="File name" style={{ flex:2, padding:"5px 8px", border:"1.5px solid var(--border)", borderRadius:6, fontSize:12, outline:"none" }}/>
          <select value={newAtt.type} onChange={e => setNewAtt(n => ({...n, type:e.target.value}))}
            style={{ flex:1, padding:"5px 6px", border:"1.5px solid var(--border)", borderRadius:6, fontSize:12, outline:"none" }}>
            {UPDATE_ATTACHMENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <input value={newAtt.url} onChange={e => setNewAtt(n => ({...n, url:e.target.value}))}
            placeholder="URL (optional)" style={{ flex:2, padding:"5px 8px", border:"1.5px solid var(--border)", borderRadius:6, fontSize:12, outline:"none" }}/>
          <button className="btn btn-sec btn-xs" onClick={addAtt}><Plus size={11}/>Add</button>
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN UPDATES PAGE
// ══════════════════════════════════════════════════════════════
function Updates({ updates, setUpdates, currentUser, orgUsers }) {
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState("All");
  const [priFilter, setPriFilter]   = useState("All");
  const [readFilter, setReadFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected]     = useState(null);
  const [modal, setModal]           = useState(null); // null | "create" | "edit"
  const [form, setForm]             = useState({ ...BLANK_FORM });
  const [confirm, setConfirm]       = useState(null);

  const allUsers = orgUsers || INIT_USERS;
  const dbUser   = allUsers.find(u => u.id === currentUser);
  const userRole = dbUser?.role || "viewer";
  const canPost      = PERMISSIONS_UPDATES.canPost.includes(userRole);
  const canManageAll = PERMISSIONS_UPDATES.canManageAll.includes(userRole);

  // My visible updates
  const myUpdates = useMemo(() => {
    return (updates || []).filter(u => {
      if (u.archived && !showArchived) return false;
      const isRecipient = (u.recipientUserIds || []).includes(currentUser);
      const isAuthor    = u.createdBy === currentUser;
      return isRecipient || isAuthor || canManageAll;
    });
  }, [updates, currentUser, showArchived, canManageAll]);

  const unreadCount = myUpdates.filter(u => (u.readStatus || {})[currentUser] !== "read").length;

  // Filtered + sorted feed
  const filtered = useMemo(() => {
    let res = myUpdates;
    if (catFilter !== "All") res = res.filter(u => u.category === catFilter);
    if (priFilter !== "All") res = res.filter(u => u.priority === priFilter);
    if (readFilter === "unread") res = res.filter(u => (u.readStatus || {})[currentUser] !== "read");
    if (readFilter === "read")   res = res.filter(u => (u.readStatus || {})[currentUser] === "read");
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(u =>
        u.title.toLowerCase().includes(q) ||
        (u.description || "").toLowerCase().includes(q) ||
        (u.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return [...res].sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
  }, [myUpdates, catFilter, priFilter, readFilter, search, currentUser]);

  const selectedUpd = selected ? (updates || []).find(u => u.id === selected) : null;

  // Mark as read
  const markRead = id => {
    setUpdates(prev => prev.map(u => u.id !== id ? u : {
      ...u, readStatus: { ...(u.readStatus || {}), [currentUser]:"read" }
    }));
  };

  // Archive
  const archiveUpdate = id => {
    setUpdates(prev => prev.map(u => u.id !== id ? u : { ...u, archived:true }));
    if (selected === id) setSelected(null);
  };

  // Open create
  const openCreate = () => { setForm({ ...BLANK_FORM }); setModal("create"); };

  // Open edit
  const openEdit = upd => {
    setForm({
      title:          upd.title,
      category:       upd.category,
      priority:       upd.priority,
      description:    upd.description,
      recipientMode:  upd.recipientMode,
      recipientUserIds: upd.recipientUserIds || [],
      taggedUserIds:  upd.taggedUserIds || [],
      tags:           (upd.tags || []).join(", "),
      attachments:    upd.attachments || [],
    });
    setModal("edit");
  };

  // Save create
  const saveCreate = () => {
    if (!form.title.trim() || !form.description.trim()) return;
    const now = new Date().toISOString();
    const seq = (updates || []).length + 1;
    const newUpd = {
      id:           `upd_${uid()}`,
      updateId:     `#UPD-${new Date().getFullYear()}-${String(seq).padStart(3,"0")}`,
      title:        form.title.trim(),
      description:  form.description.trim(),
      category:     form.category,
      priority:     form.priority,
      tags:         form.tags.split(",").map(t=>t.trim()).filter(Boolean),
      createdBy:    currentUser,
      createdAt:    now,
      updatedAt:    now,
      recipientMode:    form.recipientMode,
      recipientTeamIds: [],
      recipientUserIds: expandRecipients(form.recipientMode, form.recipientUserIds, allUsers),
      taggedUserIds:    form.taggedUserIds || [],
      attachments:      form.attachments || [],
      readStatus:       { [currentUser]:"read" },
      editHistory:      [],
      archived:         false,
    };
    setUpdates(prev => [newUpd, ...prev]);
    setModal(null);
    setSelected(newUpd.id);
  };

  // Save edit
  const saveEdit = () => {
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    setUpdates(prev => prev.map(u => u.id !== selected ? u : {
      ...u,
      title:        form.title.trim(),
      description:  form.description.trim(),
      category:     form.category,
      priority:     form.priority,
      tags:         form.tags.split(",").map(t=>t.trim()).filter(Boolean),
      recipientMode:    form.recipientMode,
      recipientUserIds: expandRecipients(form.recipientMode, form.recipientUserIds, allUsers),
      taggedUserIds:    form.taggedUserIds || [],
      attachments:      form.attachments || [],
      updatedAt:    now,
      editHistory:  [...(u.editHistory||[]), { at:now, by:currentUser }],
    }));
    setModal(null);
  };

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Internal Updates</div>
          <div className="pg-sub">Company announcements, policy changes, product releases, and team communications.</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {unreadCount > 0 && (
            <span style={{ fontSize:12, fontWeight:700, padding:"4px 12px", borderRadius:20, background:"var(--brand-bg)", color:"var(--brand)" }}>
              {unreadCount} unread
            </span>
          )}
          {canPost && (
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={14}/>Post Update
            </button>
          )}
        </div>
      </div>

      <PageTip
        id="updates-tip-v1"
        title="Updates tip:"
        text="Click any card to read it — it is automatically marked as Read. The bell icon in the header shows your latest unread updates. Use the Read Tracking tab to see who has acknowledged a critical announcement."
      />
      {/* Filter bar */}
      <div className="upd-filter-bar">
        <div style={{ position:"relative", flex:1, maxWidth:300 }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--text3)", pointerEvents:"none" }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search updates…"
            style={{ width:"100%", padding:"7px 10px 7px 32px", border:"1.5px solid var(--border)", borderRadius:8, fontSize:13, outline:"none", background:"white", color:"var(--text)" }}/>
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="filter-select">
          <option value="All">All Categories</option>
          {UPDATE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={priFilter} onChange={e => setPriFilter(e.target.value)} className="filter-select">
          <option value="All">All Priorities</option>
          {["Critical","High","Medium","Low"].map(p => <option key={p}>{p}</option>)}
        </select>
        <div style={{ display:"flex", gap:4 }}>
          {[["all","All"],["unread","Unread"],["read","Read"]].map(([val,lbl]) => (
            <button key={val} className={`btn btn-xs ${readFilter===val?"btn-primary":"btn-sec"}`}
              onClick={() => setReadFilter(val)}>{lbl}</button>
          ))}
        </div>
        <label style={{ fontSize:12, color:"var(--text3)", display:"flex", alignItems:"center", gap:5, cursor:"pointer", userSelect:"none" }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>
          Archived
        </label>
      </div>

      {/* Two-column layout */}
      <div className="upd-layout">
        {/* Feed */}
        <div className="upd-feed">
          {filtered.length === 0 && (
            <div style={{ padding:"48px 20px", textAlign:"center", color:"var(--text3)" }}>
              <Bell size={30} style={{ margin:"0 auto 12px", display:"block", opacity:0.35 }}/>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:4, color:"var(--text2)" }}>No updates found</div>
              <div style={{ fontSize:12 }}>
                {readFilter==="unread" ? "You're all caught up! 🎉" : "Try adjusting filters or post the first update."}
              </div>
              {canPost && readFilter !== "unread" && (
                <button className="btn btn-primary" style={{ marginTop:16 }} onClick={openCreate}>
                  <Plus size={14}/>Post First Update
                </button>
              )}
            </div>
          )}
          {filtered.map(upd => (
            <UpdateFeedCard key={upd.id}
              upd={upd}
              isSelected={selected === upd.id}
              isUnread={(upd.readStatus || {})[currentUser] !== "read"}
              currentUser={currentUser}
              orgUsers={orgUsers}
              onClick={() => {
                setSelected(upd.id);
                markRead(upd.id);
              }}
            />
          ))}
        </div>

        {/* Detail panel */}
        {selectedUpd ? (
          <UpdateDetailPanel
            upd={selectedUpd}
            currentUser={currentUser}
            orgUsers={orgUsers}
            onClose={() => setSelected(null)}
            onEdit={() => openEdit(selectedUpd)}
            onArchive={id => setConfirm({ id, title: selectedUpd.title })}
            canEdit={selectedUpd.createdBy === currentUser || canManageAll}
            canManage={canManageAll}
          />
        ) : (
          <div className="upd-detail-placeholder">
            <Bell size={32} style={{ color:"var(--text3)", marginBottom:14, opacity:0.5 }}/>
            <div style={{ fontWeight:700, color:"var(--text2)", marginBottom:6, fontSize:15 }}>Select an update</div>
            <div style={{ fontSize:12.5, color:"var(--text3)" }}>Click any card on the left to read it in full.</div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <CreateUpdateModal
          form={form}
          setForm={setForm}
          onSave={modal === "create" ? saveCreate : saveEdit}
          onClose={() => setModal(null)}
          orgUsers={orgUsers}
          editMode={modal === "edit"}
        />
      )}
      {confirm && (
        <Confirm
          title="Archive Update"
          msg={`Archive "${confirm.title}"? It will be hidden from the default feed but can be recovered.`}
          onConfirm={() => { archiveUpdate(confirm.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

export default Updates;

import { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, Building2, Users, TrendingUp, Activity,
  BarChart3, Ticket, Layers, SlidersHorizontal, ChevronLeft, LogOut,
  UserPlus, Phone, FileText, DollarSign, Target, Calendar, ClipboardList, Mail, Upload, Bell, HelpCircle
} from "lucide-react";
import { TEAM_MAP, PERMISSIONS, INIT_USERS } from '../data/constants';

const canAccess = (userId, module, orgUsers, customPermissions) => {
  const u = (orgUsers||[]).find(x=>x.id===userId) || INIT_USERS.find(x=>x.id===userId);
  if(!u) return false;
  const userOverride = customPermissions?.__users?.[userId]?.[module];
  if(userOverride!==undefined) return userOverride && userOverride!==false;
  const roleOverride = customPermissions?.[u.role]?.[module];
  if(roleOverride!==undefined) return roleOverride && roleOverride!==false;
  const perm = PERMISSIONS[u.role];
  if(!perm) return false;
  return perm[module] && perm[module]!==false;
};

function Sidebar({page,setPage,collapsed,setCollapsed,tickets,leads,collections,currentUser,onLogout,orgUsers,customPermissions,myUnreadCount}) {
  const openTix=tickets.filter(t=>!["Resolved","Closed"].includes(t.status)).length;
  const activeLeads=leads?.filter(l=>l.stage!=="NA").length||0;
  const overdueCollections=collections?.filter(c=>c.pendingAmount>0&&c.status==="Overdue").length||0;
  const dbUser = (orgUsers||[]).find(u=>u.id===currentUser);
  const user = dbUser || TEAM_MAP[currentUser];
  const userRole = dbUser?.role || INIT_USERS.find(u=>u.id===currentUser)?.role || "viewer";

  const NAV=[
    {section:"Overview",items:[
      {id:"dashboard",label:"Dashboard",icon:<LayoutDashboard size={17}/>},
      {id:"updates",  label:"Updates",  icon:<Bell size={17}/>, badge: myUnreadCount||0},
    ]},
    {section:"Sales",items:[
      {id:"leads",     label:"Leads",      icon:<UserPlus size={17}/>,badge:activeLeads},
      {id:"accounts",  label:"Accounts",   icon:<Building2 size={17}/>},
      {id:"contacts",  label:"Contacts",   icon:<Users size={17}/>},
      {id:"pipeline",  label:"Pipeline",   icon:<TrendingUp size={17}/>},
      {id:"activities",label:"Activities",  icon:<Activity size={17}/>},
      {id:"callreports",label:"Call Reports",icon:<Phone size={17}/>},
      {id:"calendar",   label:"Calendar",    icon:<Calendar size={17}/>},
      {id:"communications",label:"Communications",icon:<Mail size={17}/>},
    ]},
    {section:"Post-Sales",items:[
      {id:"quotations", label:"Quotations",  icon:<ClipboardList size={17}/>},
      {id:"contracts",  label:"Contracts",   icon:<FileText size={17}/>},
      {id:"collections",label:"Collections", icon:<DollarSign size={17}/>,badge:overdueCollections},
      {id:"tickets",    label:"Tickets",     icon:<Ticket size={17}/>,badge:openTix},
    ]},
    {section:"Analytics",items:[
      {id:"targets",label:"Targets",icon:<Target size={17}/>},
      {id:"reports",label:"Reports",icon:<BarChart3 size={17}/>},
    ]},
    {section:"Admin",items:[
      ...(canAccess(currentUser,"org",orgUsers,customPermissions)?[{id:"org",label:"Organisation",icon:<Layers size={17}/>}]:[]),
      ...(canAccess(currentUser,"team",orgUsers,customPermissions)?[{id:"team",label:"Team & Users",icon:<Users size={17}/>}]:[]),
      {id:"bulkupload",label:"Bulk Upload",icon:<Upload size={17}/>},
      {id:"masters",label:"Masters",icon:<SlidersHorizontal size={17}/>},
    ]},
    {section:"Support",items:[
      {id:"help",label:"Help & Guide",icon:<HelpCircle size={17}/>},
    ]},
  ];

  // Flatten nav items for keyboard navigation
  const allNavIds = useMemo(() => NAV.flatMap(sec => sec.items.map(it => it.id)), [NAV]);
  const navRef = useRef(null);

  // Global keyboard shortcuts: Ctrl+1-9 for quick nav, arrow keys in sidebar
  useEffect(() => {
    const handleGlobalKey = (e) => {
      // Ctrl+1 through Ctrl+9 for quick page navigation
      if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < allNavIds.length) {
          e.preventDefault();
          setPage(allNavIds[idx]);
        }
      }
    };
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [allNavIds, setPage]);

  const handleNavKeyDown = (e, itemId) => {
    const idx = allNavIds.indexOf(itemId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(idx + 1, allNavIds.length - 1) : Math.max(idx - 1, 0);
      const el = navRef.current?.querySelector(`[data-nav="${allNavIds[next]}"]`);
      el?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPage(itemId);
    }
  };

  return (
    <div className={`sb${collapsed?" collapsed":""}`}>
      <div className="sb-logo">
        <div className="sb-logo-left">
          <div className="logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#1B6B5A"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#1B6B5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="logo-text">
            <div className="logo-name">SmartCRM</div>
            <div className="logo-tag">HANS INFOMATIC</div>
          </div>
        </div>
        <button className="collapse-btn" onClick={()=>setCollapsed(c=>!c)} aria-label={collapsed?"Expand sidebar":"Collapse sidebar"}><ChevronLeft size={15}/></button>
      </div>
      <nav className="sb-scroll" ref={navRef} role="navigation" aria-label="Main navigation">
        {NAV.map(sec=>(
          <div key={sec.section} className="nav-sec" role="group" aria-label={sec.section}>
            <div className="nav-sec-label" aria-hidden="true">{sec.section}</div>
            {sec.items.map(it=>(
              <div key={it.id} data-nav={it.id} role="button" tabIndex={0} aria-current={page===it.id?"page":undefined}
                className={`nav-item${page===it.id?" active":""}`}
                onClick={()=>setPage(it.id)}
                onKeyDown={e=>handleNavKeyDown(e,it.id)}>
                <span className="nav-icon" aria-hidden="true">{it.icon}</span>
                <span className="nav-label">{it.label}</span>
                {it.badge>0&&<span className="nav-badge" aria-label={`${it.badge} open`}>{it.badge}</span>}
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        <div className="u-av" style={{width:32,height:32,borderRadius:8,fontSize:11,background:"rgba(255,255,255,0.15)",flexShrink:0}}>{user?.initials||"?"}</div>
        <div className="sb-foot-text">
          <div className="sb-foot-name">{user?.name||"User"}</div>
          <div className="sb-foot-role">{user?.role} · Hans Infomatic</div>
        </div>
        <button className="sb-logout" title="Sign out" onClick={onLogout}><LogOut size={15}/></button>
      </div>
    </div>
  );
}

export default Sidebar;

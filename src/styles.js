export const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }
  :root {
    --brand:#1B6B5A; --brand-d:#134D41; --brand-dd:#0D3830; --brand-l:#2A8A74;
    --brand-glow:rgba(27,107,90,0.15); --brand-bg:#EBF7F4;
    --bg:#F2F5F8; --surface:#FFFFFF; --s2:#F8FAFB; --s3:#EEF2F6;
    --border:#E2E9EF; --border2:#C8D4DF;
    --text:#0D1F2D; --text2:#4A6070; --text3:#8BA3B4;
    --green:#16A34A; --green-bg:#F0FDF4; --green-t:#15803D;
    --amber:#D97706; --amber-bg:#FFFBEB; --amber-t:#B45309;
    --red:#DC2626; --red-bg:#FEF2F2; --red-t:#B91C1C;
    --purple:#7C3AED; --purple-bg:#F5F3FF; --purple-t:#6D28D9;
    --teal:#0D9488; --teal-bg:#F0FDFA; --teal-t:#0F766E;
    --blue:#2563EB; --blue-bg:#EFF6FF; --blue-t:#1D4ED8;
    --orange:#EA580C; --orange-bg:#FFF7ED; --orange-t:#C2410C;
    --sidebar-w:252px; --sidebar-cw:58px; --header-h:56px;
    --r:8px; --rl:12px; --rxl:16px;
    --sh-xs:0 1px 2px rgba(13,31,45,0.05);
    --sh-sm:0 1px 4px rgba(13,31,45,0.08);
    --sh:0 4px 12px rgba(13,31,45,0.10);
    --sh-md:0 8px 24px rgba(13,31,45,0.13);
    --sh-lg:0 16px 40px rgba(13,31,45,0.18);
  }
  html { font-size:14px; }
  body {
    font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
    font-size:14px; line-height:1.5; color:var(--text); background:var(--bg);
    min-height:100vh; -webkit-font-smoothing:antialiased;
  }
  h1,h2,h3,h4,h5,h6 { font-family:'Outfit',sans-serif; }
  a { text-decoration:none; color:inherit; }
  button { font-family:inherit; }

  /* ── LAYOUT ── */
  .app { display:flex; height:100vh; overflow:hidden; }

  /* ── LOGIN SCREEN ── */
  .login-wrap {
    min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:linear-gradient(135deg, var(--brand-dd) 0%, #1B6B5A 60%, #2A8A74 100%);
  }
  .login-card {
    background:white; border-radius:20px; padding:44px 40px 40px;
    width:400px; box-shadow:var(--sh-lg);
  }
  .login-logo {
    display:flex; align-items:center; gap:12px; margin-bottom:32px;
  }
  .login-logo-icon {
    width:44px; height:44px; background:var(--brand-dd); border-radius:12px;
    display:flex; align-items:center; justify-content:center;
  }
  .login-logo-text .l1 { font-family:'Outfit',sans-serif; font-size:20px; font-weight:700; color:var(--text); }
  .login-logo-text .l2 { font-size:11px; color:var(--text3); letter-spacing:0.05em; text-transform:uppercase; margin-top:1px; }
  .login-title { font-family:'Outfit',sans-serif; font-size:22px; font-weight:700; color:var(--text); margin-bottom:6px; }
  .login-sub   { font-size:13px; color:var(--text3); margin-bottom:28px; }
  .login-field { margin-bottom:16px; }
  .login-field label { display:block; font-size:12px; font-weight:600; color:var(--text2); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em; }
  .login-input-wrap { position:relative; }
  .login-input-icon { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:var(--text3); }
  .login-input {
    width:100%; padding:11px 13px 11px 40px; border:1.5px solid var(--border);
    border-radius:var(--r); font-size:14px; font-family:inherit;
    color:var(--text); background:var(--s2); transition:border-color 0.15s;
    outline:none;
  }
  .login-input:focus { border-color:var(--brand); background:white; }
  .login-eye {
    position:absolute; right:12px; top:50%; transform:translateY(-50%);
    background:none; border:none; cursor:pointer; color:var(--text3); padding:2px;
  }
  .login-err { font-size:12px; color:var(--red); margin-top:4px; }
  .login-btn {
    width:100%; padding:13px; background:var(--brand); color:white;
    border:none; border-radius:var(--r); font-size:14px; font-weight:600;
    cursor:pointer; font-family:'Outfit',sans-serif; margin-top:8px;
    transition:background 0.15s; letter-spacing:0.01em;
  }
  .login-btn:hover { background:var(--brand-d); }
  .login-hint {
    margin-top:20px; padding:12px 14px; background:var(--brand-bg);
    border-radius:var(--r); font-size:12px; color:var(--brand-d); line-height:1.6;
  }
  .login-foot { margin-top:28px; text-align:center; font-size:11px; color:var(--text3); }

  /* ── SIDEBAR ── */
  .sb {
    width:var(--sidebar-w); background:var(--brand-dd);
    display:flex; flex-direction:column; height:100vh;
    overflow:hidden; flex-shrink:0; z-index:200;
    transition:width 0.22s cubic-bezier(0.4,0,0.2,1);
  }
  .sb.collapsed { width:var(--sidebar-cw); }
  .sb-scroll { flex:1; overflow-y:auto; overflow-x:hidden; padding:6px; }
  .sb-scroll::-webkit-scrollbar { width:3px; }
  .sb-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.10); border-radius:99px; }
  .sb-logo {
    padding:14px 12px; display:flex; align-items:center; gap:10px;
    border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;
    background:rgba(0,0,0,0.18); overflow:hidden; justify-content:space-between;
    min-height:64px;
  }
  .sb-logo-left { display:flex; align-items:center; gap:10px; min-width:0; flex:1; overflow:hidden; }
  .logo-icon { width:36px; height:36px; background:white; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
  .logo-text { overflow:hidden; transition:opacity 0.15s, width 0.22s cubic-bezier(0.4,0,0.2,1); }
  .sb.collapsed .logo-text { opacity:0; width:0; }
  .logo-name { font-family:'Outfit',sans-serif; font-size:15px; font-weight:700; color:#fff; letter-spacing:-0.01em; white-space:nowrap; }
  .logo-tag  { font-size:10px; color:rgba(255,255,255,0.38); margin-top:1px; white-space:nowrap; letter-spacing:0.04em; }
  .collapse-btn {
    width:26px; height:26px; border-radius:6px; border:none;
    background:rgba(255,255,255,0.08); cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    color:rgba(255,255,255,0.5); flex-shrink:0;
    transition:background 0.13s, color 0.13s, transform 0.22s;
  }
  .collapse-btn:hover { background:rgba(255,255,255,0.16); color:white; }
  .sb.collapsed .collapse-btn { transform:rotate(180deg); }
  .nav-sec { margin-bottom:4px; }
  .nav-sec-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em; color:rgba(255,255,255,0.28); padding:8px 10px 4px; white-space:nowrap; overflow:hidden; transition:opacity 0.15s; }
  .sb.collapsed .nav-sec-label { opacity:0; }
  .nav-item {
    display:flex; align-items:center; gap:9px;
    padding:7px 10px; border-radius:7px; cursor:pointer;
    color:rgba(255,255,255,0.52); font-size:13px; font-weight:400;
    transition:background 0.12s, color 0.12s;
    margin-bottom:1px; position:relative; white-space:nowrap; overflow:hidden;
  }
  .nav-item:hover { background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.88); }
  .nav-item.active { background:rgba(255,255,255,0.13); color:#fff; font-weight:500; }
  .nav-item.active::before { content:''; position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:60%; background:#5CE8C8; border-radius:0 3px 3px 0; }
  .nav-icon { font-size:17px; flex-shrink:0; opacity:0.75; display:flex; }
  .nav-item.active .nav-icon { opacity:1; }
  .nav-label { flex:1; min-width:0; transition:opacity 0.13s, width 0.22s; white-space:nowrap; overflow:hidden; }
  .sb.collapsed .nav-label { opacity:0; width:0; }
  .nav-badge { font-size:10px; font-weight:700; padding:1px 6px; border-radius:99px; flex-shrink:0; line-height:1.5; background:var(--red); color:white; transition:opacity 0.13s; }
  .nav-badge.g { background:var(--green); }
  .sb.collapsed .nav-badge { opacity:0; }
  .sb.collapsed .nav-item { justify-content:center; padding:8px; }
  .sb-foot { padding:10px 12px; border-top:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; gap:9px; flex-shrink:0; overflow:hidden; min-height:54px; }
  .sb-foot-text { overflow:hidden; transition:opacity 0.13s, width 0.22s; flex:1; min-width:0; }
  .sb.collapsed .sb-foot-text { opacity:0; width:0; }
  .sb.collapsed .sb-foot { justify-content:center; padding:10px; }
  .sb-foot-name { font-size:12.5px; font-weight:500; color:rgba(255,255,255,0.75); white-space:nowrap; }
  .sb-foot-role { font-size:11px; color:rgba(255,255,255,0.36); white-space:nowrap; }
  .sb-logout { background:none; border:none; cursor:pointer; color:rgba(255,255,255,0.35); padding:4px; border-radius:5px; transition:color 0.12s, background 0.12s; flex-shrink:0; display:flex; }
  .sb-logout:hover { color:rgba(255,255,255,0.8); background:rgba(255,255,255,0.08); }
  .sb.collapsed .sb-logout { display:none; }

  /* ── HEADER ── */
  .main { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
  .header { height:var(--header-h); background:var(--surface); border-bottom:1px solid var(--border); display:flex; align-items:center; padding:0 22px; gap:12px; flex-shrink:0; box-shadow:var(--sh-xs); z-index:100; }
  .hdr-bread { display:flex; align-items:center; gap:6px; flex:1; min-width:0; }
  .hdr-page { font-family:'Outfit',sans-serif; font-size:15px; font-weight:600; color:var(--text); }
  .hdr-sub  { font-size:13px; color:var(--text3); }
  .hdr-search { display:flex; align-items:center; gap:8px; background:var(--s2); border:1.5px solid var(--border); border-radius:var(--r); padding:7px 12px; width:240px; flex-shrink:0; position:relative; transition:border-color 0.15s; }
  .hdr-search:focus-within { border-color:var(--brand); background:white; }
  .hdr-search input { border:none; outline:none; background:transparent; font-size:13px; color:var(--text); width:100%; }
  .hdr-search input::placeholder { color:var(--text3); }
  .hdr-actions { display:flex; align-items:center; gap:8px; }
  .icon-btn { width:34px; height:34px; border-radius:8px; border:none; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text2); transition:background 0.12s, color 0.12s; position:relative; }
  .icon-btn:hover { background:var(--s3); color:var(--text); }
  .notif-dot { position:absolute; top:6px; right:7px; width:7px; height:7px; background:var(--red); border-radius:50%; border:2px solid white; }
  .avatar { width:32px; height:32px; border-radius:8px; background:var(--brand); color:white; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; font-family:'Outfit',sans-serif; }
  .search-dropdown { position:absolute; top:100%; left:0; right:0; background:white; border:1px solid var(--border); border-radius:var(--r); box-shadow:var(--sh); z-index:300; max-height:280px; overflow-y:auto; margin-top:4px; }
  .search-item { display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer; transition:background 0.1s; }
  .search-item:hover { background:var(--s2); }

  /* ── MAIN CONTENT ── */
  .content { flex:1; overflow-y:auto; padding:22px; }
  .content::-webkit-scrollbar { width:5px; }
  .content::-webkit-scrollbar-thumb { background:var(--border2); border-radius:99px; }
  .pg-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; gap:16px; }
  .pg-title { font-family:'Outfit',sans-serif; font-size:20px; font-weight:700; color:var(--text); line-height:1.2; }
  .pg-sub   { font-size:13px; color:var(--text3); margin-top:2px; }
  .pg-actions { display:flex; gap:8px; flex-shrink:0; align-items:center; }

  /* ── BUTTONS ── */
  .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:var(--r); font-size:13px; font-weight:500; border:none; cursor:pointer; font-family:inherit; transition:background 0.12s, box-shadow 0.12s; white-space:nowrap; }
  .btn-primary { background:var(--brand); color:white; }
  .btn-primary:hover { background:var(--brand-d); }
  .btn-sec { background:var(--surface); color:var(--text2); border:1.5px solid var(--border); }
  .btn-sec:hover { background:var(--s3); }
  .btn-blue { background:var(--blue); color:white; }
  .btn-blue:hover { background:var(--blue-t); }
  .btn-green { background:var(--green); color:white; }
  .btn-green:hover { background:var(--green-t); }
  .btn-danger { background:var(--red); color:white; }
  .btn-danger:hover { background:var(--red-t); }
  .btn-sm { padding:5px 10px; font-size:12px; }
  .btn-xs { padding:3px 8px; font-size:11px; border-radius:6px; }

  /* ── CARDS ── */
  .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); padding:20px; box-shadow:var(--sh-xs); }
  .card-title { font-family:'Outfit',sans-serif; font-size:14px; font-weight:600; margin-bottom:14px; color:var(--text); }

  /* ── LIST + ASIDE LAYOUT ──
     Pages like Leads / Accounts / Contacts show a table on the left with an
     insights panel on the right. Without these classes the table's content
     width pushed the rightmost action column visually OVER the aside on
     ~1100–1400px viewports (the flex item shrunk via min-width:0 but the
     table inside stayed wider, and overflow was visible). The fix:
       1. main column gets min-width:0 so flex can shrink it
       2. wrap the table in .tbl-scroll so horizontal overflow scrolls
          inside the column instead of bleeding out
       3. aside drops below the main column at narrow viewports rather
          than getting overlapped */
  .list-with-aside { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; }
  .list-with-aside > .lwa-main { flex:1 1 540px; min-width:0; }
  .list-with-aside > .lwa-aside { flex:0 0 270px; }
  .list-with-aside > .lwa-aside.w260 { flex-basis:260px; }
  @media (max-width: 1180px) {
    .list-with-aside > .lwa-aside { flex:1 1 100%; }
  }
  .tbl-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }

  /* ── TYPEAHEAD SELECT ──
     Drop-in replacement for static <select> + <option> filters and
     entity pickers (Account / Contact / Owner / Product / etc.). The
     wrapper is position:relative so the .ts-panel can absolute-position
     beneath the input without depending on the parent's overflow.
     Two size presets: .ts-filter (compact, matches .filter-select) and
     .ts-form (default form-input height). */
  .ts-wrap { display:inline-flex; align-items:center; min-width:0; position:relative; }
  /* Default width when used in a .filter-bar so it visually matches .filter-select */
  .ts-wrap.ts-filter { min-width:160px; }
  .filter-bar > .ts-wrap.ts-filter { flex:0 0 auto; width:170px; }
  .ts-input {
    width:100%; background:var(--surface); border:1.5px solid var(--border);
    border-radius:var(--r); font-family:inherit; color:var(--text);
    outline:none; transition:border-color 0.12s;
  }
  .ts-input:focus { border-color:var(--brand); }
  .ts-error .ts-input { border-color:#DC2626; }
  .ts-input:disabled { background:var(--s2); color:var(--text3); cursor:not-allowed; }
  .ts-filter .ts-input { padding:7px 28px 7px 10px; font-size:13px; }
  .ts-form   .ts-input { padding:9px 30px 9px 12px; font-size:14px; }
  .ts-input-with-icon { padding-left:32px !important; }
  .ts-icon {
    position:absolute; left:10px; top:50%; transform:translateY(-50%);
    color:var(--text3); pointer-events:none; display:flex; align-items:center;
  }
  .ts-clear {
    position:absolute; right:8px; top:50%; transform:translateY(-50%);
    width:18px; height:18px; border-radius:9px; border:none; cursor:pointer;
    background:var(--s3); color:var(--text2); font-size:14px; line-height:1;
    display:flex; align-items:center; justify-content:center; padding:0;
  }
  .ts-clear:hover { background:var(--border2); color:var(--text); }
  .ts-panel {
    position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:50;
    background:var(--surface); border:1px solid var(--border); border-radius:var(--r);
    box-shadow:var(--sh-md); max-height:280px; overflow-y:auto;
    padding:4px; min-width:200px;
  }
  .ts-panel::-webkit-scrollbar { width:6px; }
  .ts-panel::-webkit-scrollbar-thumb { background:var(--border2); border-radius:99px; }
  .ts-row {
    padding:7px 10px; border-radius:6px; cursor:pointer;
    font-size:13px; color:var(--text);
  }
  .ts-row-hi { background:var(--brand-bg); }
  .ts-row-all { font-weight:600; color:var(--text2); border-bottom:1px solid var(--border); border-radius:0; margin-bottom:2px; }
  .ts-row-all.ts-row-hi { background:var(--s3); }
  .ts-row-label { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ts-row-sub   { font-size:11px; color:var(--text3); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ts-empty     { padding:12px; font-size:12px; color:var(--text3); text-align:center; }

  /* ── FILTER BAR ── */
  .filter-bar { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
  .filter-search { display:flex; align-items:center; gap:7px; background:var(--surface); border:1.5px solid var(--border); border-radius:var(--r); padding:7px 12px; flex:1; min-width:180px; max-width:280px; }
  .filter-search input { border:none; outline:none; background:transparent; font-size:13px; color:var(--text); width:100%; }
  .filter-select { background:var(--surface); border:1.5px solid var(--border); border-radius:var(--r); padding:7px 10px; font-size:13px; color:var(--text); outline:none; font-family:inherit; cursor:pointer; }
  .filter-select:focus { border-color:var(--brand); }

  /* ── BADGES & CHIPS ── */
  .badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; white-space:nowrap; }
  .badge-pill { display:inline-flex; align-items:center; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600; white-space:nowrap; }
  .bs-active      { background:#DCFCE7; color:#15803D; }
  .bs-prospect    { background:#EFF6FF; color:#1D4ED8; }
  .bs-won         { background:#D1FAE5; color:#065F46; }
  .bs-lost        { background:#FEE2E2; color:#991B1B; }
  .bs-negotiation { background:#FFF7ED; color:#C2410C; }
  .bs-proposal    { background:#FFFBEB; color:#B45309; }
  .bs-demo        { background:#F5F3FF; color:#6D28D9; }
  .bs-pending     { background:#FEF3C7; color:#92400E; }
  .bs-review      { background:#EFF6FF; color:#1E40AF; }
  .bs-closed      { background:#F1F5F9; color:#475569; }
  .bs-planned     { background:#EFF6FF; color:#1D4ED8; }
  .bs-completed   { background:#DCFCE7; color:#15803D; }
  .bs-cancelled   { background:#FEE2E2; color:#991B1B; }
  .bp-critical { background:#FEE2E2; color:#991B1B; }
  .bp-high     { background:#FEF3C7; color:#92400E; }
  .bp-medium   { background:#EFF6FF; color:#1E40AF; }
  .bp-low      { background:#F1F5F9; color:#475569; }
  .prod-tag { display:inline-flex; align-items:center; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:600; }
  .u-pill { display:inline-flex; align-items:center; gap:5px; }
  .u-av { width:22px; height:22px; border-radius:6px; background:var(--brand-bg); color:var(--brand); font-size:9px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; flex-shrink:0; }
  .u-name { font-size:12px; color:var(--text2); }

  /* ── TABLES ── */
  .tbl { width:100%; border-collapse:collapse; }
  .tbl th { text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--text3); padding:10px 14px; background:var(--s2); border-bottom:1px solid var(--border); }
  .tbl td { padding:11px 14px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
  .tbl tr:last-child td { border-bottom:none; }
  .tbl tr:hover td { background:var(--s2); }
  .tbl-link { cursor:pointer; font-weight:500; color:var(--brand); }
  .tbl-link:hover { text-decoration:underline; }

  /* ── FORMS ── */
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  .form-row.full { grid-template-columns:1fr; }
  .form-row.three { grid-template-columns:1fr 1fr 1fr; }
  .form-group { display:flex; flex-direction:column; gap:5px; margin-bottom:0; }
  .form-group label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text3); }
  .form-group input, .form-group select, .form-group textarea {
    padding:9px 11px; border:1.5px solid var(--border); border-radius:var(--r);
    font-size:13px; color:var(--text); background:white; outline:none; font-family:inherit;
    transition:border-color 0.15s;
  }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color:var(--brand); }
  .form-group textarea { resize:vertical; min-height:80px; }

  /* ── MODALS ── */
  /* Modal backdrop. Per UX policy (PR #101) clicks on the backdrop do NOT
     close the modal — the user must use Submit / Save / Cancel / X icon.
     cursor:default makes that visually obvious so users don't reflexively
     click expecting it to close. */
  .overlay { position:fixed; inset:0; background:rgba(13,31,45,0.48); z-index:500; display:flex; align-items:center; justify-content:center; padding:20px; cursor:default; }
  .modal { background:white; border-radius:var(--rxl); box-shadow:var(--sh-lg); width:100%; max-width:520px; max-height:90vh; display:flex; flex-direction:column; }
  .modal-lg { max-width:680px; }
  /* xl: wide enough for the Quotations Items composer (Charge/Desc/Currency/ExRate/Unit/Qty/MRP/Discount + Price/Cost/Amount + chips) without horizontal scroll on standard desktops */
  .modal-xl { max-width:min(1180px, 96vw); }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 0; flex-shrink:0; }
  .modal-title { font-family:'Outfit',sans-serif; font-size:16px; font-weight:700; color:var(--text); }
  .modal-body { padding:20px 24px; overflow-y:auto; flex:1; }
  .modal-foot { padding:16px 24px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px; flex-shrink:0; }
  .modal-tabs { display:flex; gap:0; border-bottom:2px solid var(--border); margin-bottom:20px; }
  .modal-tab { padding:8px 16px; font-size:13px; font-weight:500; color:var(--text3); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; transition:color 0.12s, border-color 0.12s; }
  .modal-tab.active { color:var(--brand); border-bottom-color:var(--brand); font-weight:600; }
  /* ── floating-window opt-ins (draggable / resizable Modal) ── */
  .modal-draggable .modal-head { cursor:move; user-select:none; }
  .modal-draggable .modal-head .modal-title::before { content:"⋮⋮"; display:inline-block; color:var(--text3); margin-right:8px; letter-spacing:-2px; font-size:14px; transform:rotate(90deg); opacity:0.6; }
  .modal-resizable { resize:both; overflow:hidden; min-width:480px; min-height:360px; }
  /* When resizable, drop the height cap so the user can grow the window beyond 90vh */
  .modal-resizable { max-height:none; height:min(90vh, 800px); }
  /* Once the user has dragged, escape the overlay's flex centering */
  .modal-floating { margin:0 !important; }

  /* ── MISC ── */
  .empty { text-align:center; padding:48px 20px; }
  .empty-icon { color:var(--border2); margin-bottom:12px; display:flex; justify-content:center; }
  .empty-title { font-family:'Outfit',sans-serif; font-size:15px; font-weight:600; color:var(--text2); margin-bottom:4px; }
  .empty-sub { font-size:13px; color:var(--text3); }

  /* ── KPI CARDS (Dashboard) ── */
  .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px; margin-bottom:20px; }
  .kpi { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); padding:16px 18px; box-shadow:var(--sh-xs); }
  .kpi-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--text3); margin-bottom:8px; }
  .kpi-val { font-family:'Outfit',sans-serif; font-size:26px; font-weight:700; color:var(--text); line-height:1; }
  .kpi-sub { font-size:12px; color:var(--text3); margin-top:5px; }
  .kpi-delta { font-size:12px; font-weight:600; margin-top:5px; }
  .kpi-delta.up { color:var(--green); }
  .kpi-delta.dn { color:var(--red); }

  /* ── DASHBOARD GRIDS ── */
  .dash-2col { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
  .dash-3col { display:grid; grid-template-columns:2fr 1fr 1fr; gap:16px; margin-bottom:16px; }
  @media(max-width:1100px) { .dash-2col,.dash-3col { grid-template-columns:1fr; } }

  /* ── TIMELINE ── */
  .timeline { position:relative; }
  .timeline::before { content:''; position:absolute; left:16px; top:0; bottom:0; width:2px; background:var(--border); }
  .tl-item { display:flex; gap:14px; padding-bottom:20px; }
  .tl-dot { width:32px; height:32px; border-radius:50%; border:2.5px solid; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:white; z-index:1; }
  .tl-body { flex:1; min-width:0; padding-top:2px; }
  .tl-head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px; }
  .tl-title { font-weight:600; font-size:13.5px; color:var(--text); line-height:1.3; }
  .tl-date  { font-size:11px; color:var(--text3); white-space:nowrap; flex-shrink:0; }
  .tl-meta  { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px; }
  .tl-notes { font-size:12px; color:var(--text2); line-height:1.5; background:var(--s2); padding:8px 10px; border-radius:6px; border-left:3px solid var(--border2); }

  /* ── ACTIVITY CARDS (enhanced) ── */
  .act-quick { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
  .act-tabs { display:flex; gap:2px; background:var(--s2); border:1px solid var(--border); border-radius:var(--r); padding:3px; margin-bottom:16px; width:fit-content; }
  .act-tab { padding:5px 14px; border-radius:6px; font-size:12.5px; font-weight:500; color:var(--text3); cursor:pointer; transition:background 0.12s, color 0.12s; white-space:nowrap; }
  .act-tab.active { background:white; color:var(--brand); font-weight:600; box-shadow:var(--sh-xs); }
  .act-card {
    background:var(--surface); border:1px solid var(--border); border-radius:var(--rl);
    padding:14px 16px; margin-bottom:10px; display:flex; gap:14px; align-items:flex-start;
    transition:box-shadow 0.12s, border-color 0.12s;
  }
  .act-card:hover { box-shadow:var(--sh-sm); border-color:var(--border2); }
  .act-card.planned { border-left:3px solid var(--blue); }
  .act-card.overdue { border-left:3px solid var(--red); }
  .act-card.completed { border-left:3px solid var(--green); }
  .act-card-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .act-card-main { flex:1; min-width:0; }
  .act-card-title { font-weight:600; font-size:13.5px; color:var(--text); margin-bottom:5px; }
  .act-card-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:5px; }
  .act-card-links { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11.5px; color:var(--text3); }
  .act-card-link { display:inline-flex; align-items:center; gap:3px; background:var(--s2); padding:2px 7px; border-radius:4px; }
  .act-card-actions { display:flex; gap:4px; flex-shrink:0; }
  .act-overdue-badge { background:var(--red-bg); color:var(--red-t); font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; }

  /* ── NOTES THREAD ── */
  .notes-thread { display:flex; flex-direction:column; gap:12px; }
  .note-item { display:flex; gap:10px; }
  .note-av { width:30px; height:30px; border-radius:8px; background:var(--brand-bg); color:var(--brand); font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:'Outfit',sans-serif; }
  .note-bubble { flex:1; background:var(--s2); border-radius:0 10px 10px 10px; padding:10px 13px; border:1px solid var(--border); }
  .note-head { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
  .note-author { font-size:12px; font-weight:600; color:var(--text); }
  .note-date { font-size:11px; color:var(--text3); }
  .note-text { font-size:13px; color:var(--text2); line-height:1.55; }
  .note-compose { display:flex; gap:10px; margin-top:16px; padding-top:14px; border-top:1px solid var(--border); }
  .note-input-wrap { flex:1; }
  .note-input { width:100%; padding:10px 13px; border:1.5px solid var(--border); border-radius:var(--r); font-size:13px; font-family:inherit; resize:none; outline:none; }
  .note-input:focus { border-color:var(--brand); }

  /* ── FILES LIST ── */
  .files-list { display:flex; flex-direction:column; gap:8px; }
  .file-item { display:flex; align-items:center; gap:12px; padding:10px 12px; background:var(--s2); border-radius:var(--r); border:1px solid var(--border); }
  .file-icon { width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:var(--brand-bg); color:var(--brand); }
  .file-name { font-size:13px; font-weight:500; color:var(--text); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .file-meta { font-size:11px; color:var(--text3); display:flex; gap:10px; }
  .file-actions { display:flex; gap:4px; }

  /* ── ACCOUNT DETAIL TABS ── */
  .detail-tabs { display:flex; gap:0; border-bottom:2px solid var(--border); margin-bottom:20px; }
  .detail-tab { padding:9px 18px; font-size:13px; font-weight:500; color:var(--text3); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; transition:color 0.12s, border-color 0.12s; }
  .detail-tab.active { color:var(--brand); border-bottom-color:var(--brand); font-weight:600; }
  .dp-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 20px; }
  .dp-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid var(--s3); }
  .dp-key { font-size:12px; color:var(--text3); font-weight:500; flex-shrink:0; }
  .dp-val { font-size:13px; color:var(--text); font-weight:500; text-align:right; }

  /* ── KANBAN ── */
  .kanban { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; }
  .kanban::-webkit-scrollbar { height:5px; }
  .kanban::-webkit-scrollbar-thumb { background:var(--border2); border-radius:99px; }
  .kb-col { flex-shrink:0; width:230px; }
  .kb-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding:0 2px; }
  .kb-label { font-size:12px; font-weight:700; color:var(--text2); text-transform:uppercase; letter-spacing:0.07em; }
  .kb-count { font-size:11px; font-weight:700; padding:2px 7px; border-radius:99px; background:var(--s3); color:var(--text3); }
  .kb-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:12px; margin-bottom:8px; box-shadow:var(--sh-xs); cursor:pointer; transition:box-shadow 0.12s; }
  .kb-card:hover { box-shadow:var(--sh-sm); }
  .kb-title { font-size:12.5px; font-weight:600; color:var(--text); margin-bottom:7px; line-height:1.35; }
  .kb-row { display:flex; align-items:center; justify-content:space-between; font-size:11px; color:var(--text3); }
  .kb-val { font-family:'Outfit',sans-serif; font-size:14px; font-weight:700; color:var(--text); }
  .kb-btns { display:flex; gap:4px; margin-top:8px; }
  .kb-btn { flex:1; padding:5px; border-radius:6px; border:1px solid var(--border); background:var(--s2); font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:3px; color:var(--text2); transition:background 0.1s; }
  .kb-btn:hover { background:var(--brand-bg); color:var(--brand); border-color:var(--brand); }

  /* ── MASTERS ── */
  .masters-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }
  .masters-section { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); overflow:hidden; }
  .masters-sec-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border); background:var(--s2); }
  .masters-sec-title { font-family:'Outfit',sans-serif; font-size:13px; font-weight:700; color:var(--text); }
  .masters-item { display:flex; align-items:center; justify-content:space-between; padding:9px 16px; border-bottom:1px solid var(--border); }
  .masters-item:last-child { border-bottom:none; }
  .masters-item-name { font-size:13px; color:var(--text); }
  .masters-item-sub  { font-size:11px; color:var(--text3); margin-top:1px; }
  .masters-item-actions { display:flex; gap:4px; }

  /* ── REPORTS ── */
  .rpt-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); padding:20px; box-shadow:var(--sh-xs); }
  .rpt-title { font-family:'Outfit',sans-serif; font-size:14px; font-weight:600; color:var(--text); margin-bottom:16px; }

  /* ── RECHARTS overrides ── */
  .recharts-tooltip-wrapper { font-size:12px !important; }
  .recharts-legend-item-text { font-size:12px !important; }

  /* ── PRODUCT CATALOG (Masters) ── */
  .prod-catalog-grid { display:flex; flex-direction:column; gap:16px; }
  .prod-catalog-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); overflow:hidden; }
  .prod-catalog-head { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; cursor:pointer; }
  .prod-catalog-headleft { display:flex; align-items:center; gap:12px; }
  .prod-icon { width:36px; height:36px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; font-size:11px; font-weight:800; flex-shrink:0; }
  .prod-catalog-name { font-family:'Outfit',sans-serif; font-size:14px; font-weight:700; color:var(--text); }
  .prod-catalog-desc { font-size:12px; color:var(--text3); margin-top:1px; }
  .prod-catalog-stats { display:flex; gap:12px; align-items:center; }
  .prod-catalog-body { border-top:1px solid var(--border); }
  .module-type-tag { font-size:10px; font-weight:700; padding:2px 7px; border-radius:99px; }
  .mod-core        { background:#DCFCE7; color:#15803D; }
  .mod-addon       { background:#EFF6FF; color:#1D4ED8; }
  .mod-integration { background:#FFF7ED; color:#C2410C; }
  .mod-analytics   { background:#F5F3FF; color:#6D28D9; }
  .mod-mobile      { background:#F0FDFA; color:#0F766E; }
  .module-row { display:flex; align-items:center; gap:12px; padding:11px 18px; border-bottom:1px solid var(--border); }
  .module-row:last-child { border-bottom:none; }
  .module-row:hover { background:var(--s2); }
  .module-name { font-size:13px; font-weight:500; color:var(--text); flex:1; }
  .module-desc { font-size:11.5px; color:var(--text3); flex:2; }

  /* ── ORG HIERARCHY ── */
  .org-page { display:flex; flex-direction:column; gap:16px; }
  .org-level-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text3); margin-bottom:10px; display:flex; align-items:center; gap:8px; }
  .org-level-label::after { content:''; flex:1; height:1px; background:var(--border); }
  .org-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; margin-bottom:4px; }
  .org-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); padding:14px 16px; cursor:pointer; transition:box-shadow 0.12s, border-color 0.12s; }
  .org-card:hover { box-shadow:var(--sh-sm); border-color:var(--brand); }
  .org-card.selected { border-color:var(--brand); background:var(--brand-bg); box-shadow:0 0 0 2px var(--brand-glow); }
  .org-card-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px; }
  .org-card-name { font-family:'Outfit',sans-serif; font-size:13.5px; font-weight:700; color:var(--text); }
  .org-card-sub  { font-size:11.5px; color:var(--text3); margin-top:2px; }
  .org-card-meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
  .org-tag { font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:4px; }
  .org-tag-hq     { background:#DCFCE7; color:#15803D; }
  .org-tag-office { background:#EFF6FF; color:#1D4ED8; }
  .org-tag-remote { background:#FFF7ED; color:#C2410C; }
  .org-tag-partner{ background:#F5F3FF; color:#6D28D9; }
  .org-tag-sub    { background:#F0FDFA; color:#0F766E; }
  .org-tag-internal{background:var(--brand-bg); color:var(--brand-d); }
  .org-breadcrumb { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text3); flex-wrap:wrap; background:var(--s2); padding:8px 14px; border-radius:var(--r); border:1px solid var(--border); margin-bottom:16px; }
  .org-breadcrumb .crumb { cursor:pointer; color:var(--brand); font-weight:500; }
  .org-breadcrumb .sep { color:var(--border2); }

  /* ── HIERARCHY TREE ── */
  .ht-stats { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
  .ht-stat { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:10px 16px; min-width:100px; text-align:center; }
  .ht-stat-val { font-family:'Outfit',sans-serif; font-size:20px; font-weight:800; }
  .ht-stat-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--text3); margin-top:2px; }
  .ht-tree { padding:16px 12px; }
  .ht-node { position:relative; }
  .ht-root { margin-bottom:4px; }
  .ht-children { margin-left:24px; padding-left:16px; border-left:2px solid var(--border); }
  .ht-row { display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; font-size:13px; min-height:36px; transition:background 0.1s; position:relative; }
  .ht-row:hover { background:var(--s2); }
  .ht-clickable { cursor:pointer; }
  .ht-chevron { color:var(--text3); flex-shrink:0; transition:transform 0.15s; }
  .ht-icon { width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .ht-icon-mkt { background:#DCFCE7; color:#15803D; }
  .ht-icon-co { background:#EFF6FF; color:#1D4ED8; }
  .ht-icon-div { background:#F5F3FF; color:#6D28D9; }
  .ht-icon-branch { background:#FFF7ED; color:#C2410C; }
  .ht-icon-dept { background:#F0FDFA; color:#0F766E; }
  .ht-name { font-weight:600; color:var(--text); white-space:nowrap; }
  .ht-name-bold { font-weight:700; font-family:'Outfit',sans-serif; }
  .ht-meta { font-size:11px; color:var(--text3); display:flex; align-items:center; gap:3px; }
  .ht-head { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:var(--text2); background:var(--s2); padding:2px 8px 2px 2px; border-radius:10px; border:1px solid var(--border); }
  .ht-av { width:18px; height:18px; border-radius:5px; background:var(--brand); color:white; font-size:8px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
  .ht-count { font-size:10px; font-weight:700; background:var(--teal-bg); color:var(--teal); padding:1px 6px; border-radius:8px; }
  .ht-prods { display:inline-flex; gap:4px; flex-wrap:wrap; }
  .ht-actions { display:flex; gap:2px; margin-left:auto; opacity:0.4; transition:opacity 0.15s; }
  .ht-row:hover .ht-actions { opacity:1; }
  .ht-btn { background:none; border:none; cursor:pointer; color:var(--text3); padding:3px; border-radius:4px; display:flex; align-items:center; }
  .ht-btn:hover { background:var(--s3); color:var(--text2); }
  .ht-btn-add:hover { color:var(--brand); }
  .ht-btn-del:hover { color:var(--red); }
  .ht-leaf .ht-row { padding-left:26px; }

  /* ── TEAM HIERARCHY TREE ── */
  .th-tree { padding:16px 12px; }
  .th-node { position:relative; }
  .th-children { margin-left:24px; padding-left:16px; border-left:2px solid var(--border); }
  .th-row { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; font-size:13px; min-height:40px; transition:background 0.1s; }
  .th-row:hover { background:var(--s2); }
  .th-row:hover .th-actions { opacity:1; }
  .th-clickable { cursor:pointer; }
  .th-av { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
  .th-info { flex:1; min-width:0; }
  .th-name { font-weight:600; font-size:13px; color:var(--text); }
  .th-sub { font-size:11px; color:var(--text3); }
  .th-role { font-size:10px; font-weight:600; padding:2px 8px; border-radius:6px; white-space:nowrap; }
  .th-actions { display:flex; gap:2px; opacity:0.4; transition:opacity 0.15s; }
  .th-row:hover .th-actions { opacity:1; }
  .th-direct { font-size:10px; color:var(--text3); background:var(--s3); padding:1px 6px; border-radius:8px; font-weight:600; }

  /* ── TEAM & USERS ── */
  .team-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; margin-bottom:20px; }
  .team-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); overflow:hidden; }
  .team-card-head { padding:14px 16px; display:flex; align-items:flex-start; justify-content:space-between; }
  .team-card-name { font-family:'Outfit',sans-serif; font-size:14px; font-weight:700; color:var(--text); }
  .team-card-desc { font-size:11.5px; color:var(--text3); margin-top:3px; }
  .team-member-row { display:flex; align-items:center; gap:10px; padding:9px 16px; border-top:1px solid var(--border); }
  .role-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:99px; font-size:10.5px; font-weight:700; }
  .user-table { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl); overflow:hidden; }
  .perm-table { width:100%; border-collapse:collapse; }
  .perm-table th { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--text3); padding:8px 12px; background:var(--s2); border-bottom:1px solid var(--border); text-align:center; }
  .perm-table th:first-child { text-align:left; }
  .perm-table td { padding:8px 12px; border-bottom:1px solid var(--border); font-size:12px; text-align:center; vertical-align:middle; }
  .perm-table tr:last-child td { border-bottom:none; }
  .perm-rw  { color:var(--green); font-weight:700; }
  .perm-r   { color:var(--blue); }
  .perm-no  { color:var(--border2); }
  .user-role-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:99px; }

  /* ── KEYBOARD / FOCUS ── */
  *:focus-visible { outline:2px solid var(--brand); outline-offset:2px; border-radius:4px; }
  .nav-item:focus-visible { outline:2px solid rgba(255,255,255,0.6); outline-offset:-2px; background:rgba(255,255,255,0.1); }
  .icon-btn:focus-visible { outline:2px solid var(--brand); outline-offset:1px; }
  .btn:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }
  input[type="checkbox"]:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }

  /* ── SKIP TO CONTENT (a11y) ── */
  .skip-link { position:absolute; top:-40px; left:0; background:var(--brand); color:white; padding:8px 16px; z-index:9999; font-size:13px; font-weight:600; border-radius:0 0 8px 0; transition:top 0.2s; }
  .skip-link:focus { top:0; }

  /* ══════════════════════════════════════════════════════════
     HELP TOOLTIP (inline ? popover)
  ══════════════════════════════════════════════════════════ */
  .help-tooltip-trigger {
    background:none; border:none; padding:0; cursor:pointer; display:inline-flex;
    align-items:center; color:var(--text3); transition:color 0.15s; line-height:1;
    vertical-align:middle;
  }
  .help-tooltip-trigger:hover { color:var(--brand); }
  .help-tooltip-pop {
    position:absolute; left:50%; top:calc(100% + 8px); transform:translateX(-50%);
    background:#1B2A35; color:#E8F0F5; font-size:12px; line-height:1.6;
    padding:10px 13px; border-radius:9px; z-index:1200; pointer-events:none;
    box-shadow:0 6px 20px rgba(0,0,0,0.22); white-space:normal; word-break:break-word;
    animation:fadeIn 0.12s ease;
  }
  .help-tooltip-arrow {
    position:absolute; top:-5px; left:50%; transform:translateX(-50%);
    width:10px; height:5px; overflow:hidden;
  }
  .help-tooltip-arrow::after {
    content:""; position:absolute; top:0; left:50%; transform:translateX(-50%) rotate(45deg);
    width:8px; height:8px; background:#1B2A35;
  }

  /* ══════════════════════════════════════════════════════════
     PAGE TIP (dismissible contextual banner)
  ══════════════════════════════════════════════════════════ */
  .page-tip {
    display:flex; align-items:flex-start; gap:10px;
    background:linear-gradient(135deg,#EBF7F4 0%,#F0FEFA 100%);
    border:1.5px solid #A7D9CF; border-radius:10px;
    padding:11px 14px; margin-bottom:18px; position:relative;
    animation:fadeIn 0.2s ease;
  }
  .page-tip-icon { color:var(--brand); flex-shrink:0; margin-top:1px; }
  .page-tip-body { flex:1; font-size:13px; color:var(--text2); line-height:1.55; }
  .page-tip-title { font-weight:700; color:var(--brand); }
  .page-tip-text  { color:var(--text2); }
  .page-tip-link  {
    display:inline-flex; align-items:center; gap:2px; margin-left:6px;
    background:none; border:none; padding:0; cursor:pointer; font-size:12.5px;
    font-weight:700; color:var(--brand); font-family:inherit; text-decoration:underline;
    text-underline-offset:2px; transition:opacity 0.15s;
  }
  .page-tip-link:hover { opacity:0.75; }
  .page-tip-close {
    background:none; border:none; cursor:pointer; padding:2px; color:var(--text3);
    flex-shrink:0; transition:color 0.15s; display:flex; align-items:center;
  }
  .page-tip-close:hover { color:var(--text); }

  /* ══════════════════════════════════════════════════════════
     HELP PAGE (full user manual)
  ══════════════════════════════════════════════════════════ */
  .help-search-wrap {
    display:flex; align-items:center; gap:10px;
    background:white; border:2px solid var(--border); border-radius:12px;
    padding:11px 16px; margin-bottom:20px; transition:border-color 0.15s;
    box-shadow:var(--sh-xs);
  }
  .help-search-wrap:focus-within { border-color:var(--brand); box-shadow:0 0 0 3px var(--brand-glow); }
  .help-search-input {
    flex:1; border:none; outline:none; font-size:14px; font-family:inherit;
    color:var(--text); background:transparent;
  }
  .help-search-input::placeholder { color:var(--text3); }

  .help-layout { display:flex; gap:18px; align-items:flex-start; }

  /* Left sidebar */
  .help-sidebar {
    width:230px; flex-shrink:0; background:var(--surface); border:1px solid var(--border);
    border-radius:12px; overflow:hidden; position:sticky; top:16px;
  }
  .help-cat-group { border-bottom:1px solid var(--border); }
  .help-cat-group:last-child { border-bottom:none; }
  .help-cat-item {
    display:flex; align-items:center; gap:9px; padding:10px 14px;
    cursor:pointer; transition:background 0.12s; font-size:13px; font-weight:600;
    color:var(--text2); user-select:none;
  }
  .help-cat-item:hover { background:var(--s2); }
  .help-cat-item.active { background:var(--brand-bg); color:var(--brand); }
  .help-cat-icon { flex-shrink:0; }
  .help-cat-label { flex:1; }
  .help-cat-chevron { color:var(--text3); flex-shrink:0; }
  .help-cat-item.active .help-cat-chevron { color:var(--brand); }

  .help-art-list { background:var(--s2); border-top:1px solid var(--border); }
  .help-art-item {
    padding:8px 14px 8px 36px; font-size:12.5px; color:var(--text3);
    cursor:pointer; transition:background 0.1s, color 0.1s; line-height:1.4;
  }
  .help-art-item:hover { background:var(--brand-bg); color:var(--brand); }
  .help-art-item.active { background:var(--brand-bg); color:var(--brand); font-weight:700; border-right:3px solid var(--brand); }

  /* Right article panel */
  .help-article-panel {
    flex:1; background:var(--surface); border:1px solid var(--border);
    border-radius:12px; overflow:hidden; min-height:500px;
  }
  .help-article-head {
    padding:22px 28px 14px; border-bottom:1px solid var(--border);
    background:linear-gradient(135deg,var(--s2) 0%,var(--surface) 100%);
  }
  .help-article-title {
    font-family:'Outfit',sans-serif; font-size:22px; font-weight:800;
    color:var(--text); line-height:1.3;
  }
  .help-tag {
    font-size:11px; padding:2px 9px; border-radius:20px;
    background:var(--s3); color:var(--text3); cursor:pointer; font-weight:600;
    transition:background 0.1s, color 0.1s;
  }
  .help-tag:hover { background:var(--brand-bg); color:var(--brand); }

  /* Article body content */
  .help-content-body { padding:22px 28px; }
  .help-para {
    font-size:13.5px; line-height:1.75; color:var(--text2); margin-bottom:16px;
  }
  .help-h3 {
    font-family:'Outfit',sans-serif; font-size:15px; font-weight:700;
    color:var(--text); margin:22px 0 10px; padding-bottom:6px;
    border-bottom:1.5px solid var(--border);
  }
  .help-h3:first-child { margin-top:0; }
  .help-list {
    list-style:none; margin:0 0 16px 0; padding:0; display:flex; flex-direction:column; gap:7px;
  }
  .help-list li {
    display:flex; gap:8px; align-items:flex-start; font-size:13px;
    color:var(--text2); line-height:1.6;
  }
  .help-steps {
    list-style:none; margin:0 0 16px 0; padding:0; display:flex; flex-direction:column; gap:9px;
  }
  .help-steps li {
    display:flex; gap:11px; align-items:flex-start; font-size:13px; color:var(--text2); line-height:1.6;
  }
  .help-step-num {
    width:22px; height:22px; border-radius:50%; background:var(--brand); color:white;
    font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center;
    flex-shrink:0; margin-top:1px;
  }

  /* Callouts */
  .help-callout {
    display:flex; gap:10px; padding:11px 14px; border-radius:9px; margin-bottom:14px;
    font-size:13px; line-height:1.6;
  }
  .help-callout.tip     { background:#EBF7F4; color:#134D41; border-left:3.5px solid var(--brand); }
  .help-callout.warning { background:#FEF2F2; color:#7F1D1D; border-left:3.5px solid #DC2626; }
  .help-callout.note    { background:#EFF6FF; color:#1E3A5F; border-left:3.5px solid #2563EB; }

  /* Table */
  .help-table-wrap { margin-bottom:16px; overflow-x:auto; border-radius:8px; border:1px solid var(--border); }
  .help-table { width:100%; border-collapse:collapse; font-size:13px; }
  .help-table-key {
    padding:9px 14px; font-weight:700; color:var(--text);
    background:var(--s2); border-bottom:1px solid var(--border);
    width:35%; vertical-align:top; white-space:nowrap;
  }
  .help-table-val {
    padding:9px 14px; color:var(--text2); border-bottom:1px solid var(--border);
    line-height:1.55;
  }
  .help-table tr:last-child .help-table-key,
  .help-table tr:last-child .help-table-val { border-bottom:none; }

  /* Shortcut group */
  .help-shortcut-group { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
  .help-shortcut-row   { display:flex; align-items:center; gap:12px; padding:5px 0; }
  .help-kbd {
    display:inline-flex; align-items:center; justify-content:center;
    background:var(--s3); border:1px solid var(--border2); border-bottom:2.5px solid var(--border2);
    border-radius:6px; padding:3px 10px; font-size:11.5px; font-family:'DM Mono',monospace,sans-serif;
    font-weight:700; color:var(--text); white-space:nowrap; flex-shrink:0; min-width:90px;
  }
  .help-shortcut-desc { font-size:13px; color:var(--text2); }

  /* Article next-article footer */
  .help-article-next {
    margin:24px 28px 28px; padding:14px 18px; border-radius:10px;
    background:var(--s2); border:1.5px solid var(--border); cursor:pointer;
    transition:border-color 0.15s, background 0.15s;
  }
  .help-article-next:hover { border-color:var(--brand); background:var(--brand-bg); }

  /* Search results panel */
  .help-search-results {
    flex:1; background:var(--surface); border:1px solid var(--border);
    border-radius:12px; padding:18px 20px; min-height:300px;
  }
  .help-search-result-card {
    padding:13px 16px; border-radius:9px; border:1.5px solid var(--border);
    margin-bottom:10px; cursor:pointer; transition:border-color 0.12s, background 0.12s;
  }
  .help-search-result-card:hover { border-color:var(--brand); background:var(--brand-bg); }

  /* Help header button green dot */
  .help-btn { position:relative; }

  /* Floating help FAB */
  .help-fab {
    position:fixed; bottom:88px; left:22px; z-index:500;
    width:42px; height:42px; border-radius:50%;
    background:var(--surface); border:2px solid var(--border);
    box-shadow:var(--sh-md); cursor:pointer; display:flex; align-items:center;
    justify-content:center; color:var(--text3); transition:all 0.2s;
  }
  .help-fab:hover {
    background:var(--brand); border-color:var(--brand); color:white;
    box-shadow:0 6px 20px rgba(27,107,90,0.35); transform:scale(1.08);
  }
  .help-fab-tooltip {
    position:absolute; left:52px; top:50%; transform:translateY(-50%);
    background:#1B2A35; color:white; font-size:12px; font-weight:600;
    padding:5px 11px; border-radius:7px; white-space:nowrap; pointer-events:none;
    opacity:0; transition:opacity 0.15s; box-shadow:var(--sh);
  }
  .help-fab:hover .help-fab-tooltip { opacity:1; }

  /* ── INTERNAL UPDATES MODULE ── */
  .upd-layout { display:flex; gap:16px; align-items:flex-start; min-height:calc(100vh - 200px); }
  .upd-feed { width:380px; flex-shrink:0; display:flex; flex-direction:column; gap:8px; }
  .upd-card { background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:14px 16px; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s, background 0.15s; }
  .upd-card:hover { border-color:var(--brand); box-shadow:var(--sh-sm); }
  .upd-card.selected { border-color:var(--brand); background:var(--brand-bg); box-shadow:var(--sh-sm); }
  .upd-card.unread { border-left:3px solid var(--brand); }
  .upd-card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:7px; gap:8px; }
  .upd-card-title { font-size:13.5px; color:var(--text); margin-bottom:5px; line-height:1.4; }
  .upd-card-preview { font-size:11.5px; color:var(--text3); line-height:1.55; margin-bottom:10px; }
  .upd-card-foot { display:flex; justify-content:space-between; align-items:center; }
  .upd-cat-tag { font-size:9.5px; font-weight:800; padding:2px 7px; border-radius:4px; background:var(--brand-bg); color:var(--brand); text-transform:uppercase; letter-spacing:0.05em; flex-shrink:0; }
  .upd-detail { flex:1; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; min-height:450px; }
  .upd-detail-head { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; gap:8px; }
  .upd-detail-title { font-family:'Outfit',sans-serif; font-size:17px; font-weight:700; color:var(--text); line-height:1.35; }
  .upd-detail-placeholder { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--s2); border:1.5px dashed var(--border); border-radius:12px; padding:40px; text-align:center; min-height:300px; }
  .upd-filter-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:16px; padding:10px 14px; background:var(--surface); border:1px solid var(--border); border-radius:10px; }
  .filter-select { padding:6px 10px; border:1.5px solid var(--border); border-radius:7px; font-size:12.5px; outline:none; background:white; color:var(--text2); font-family:inherit; cursor:pointer; }
  .filter-select:hover { border-color:var(--brand); }

  /* ── BELL NOTIFICATION PANEL ── */
  .bell-panel { position:absolute; right:0; top:calc(100% + 8px); width:320px; background:white; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.08); border:1px solid var(--border); z-index:999; overflow:hidden; animation:fadeIn 0.15s ease; }
  .bell-panel-head { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--border); font-weight:700; font-size:13.5px; color:var(--text); }
  .bell-item { padding:10px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.1s; }
  .bell-item:hover { background:var(--brand-bg); }
  .bell-item:last-of-type { border-bottom:none; }
  .bell-panel-foot { padding:10px 16px; text-align:center; font-size:12px; color:var(--brand); font-weight:700; cursor:pointer; border-top:1px solid var(--border); transition:background 0.1s; }
  .bell-panel-foot:hover { background:var(--brand-bg); }
`;

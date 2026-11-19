// ─── Public EULA / terms page ──────────────────────────────────────────
// #/terms/<setId> — the page a quotation links to when the EULA is written in
// the CRM (Masters → Quotation Rules → Terms & EULA, "Write it here"). No
// login: the text comes from the public `quote-terms` edge function, which
// returns only the published title and text of that terms set.
import { useState, useEffect } from "react";
import { Printer } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { eulaBlocks } from "../lib/quotation/termSets";

async function fetchTerms(id) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.functions.invoke("quote-terms", { body: { id } });
  return error ? null : data;
}

export default function PublicTerms({ id, api: apiProp = fetchTerms }) {
  // Development only: preview against sample data (window.__termsApiMock).
  const api = (import.meta.env.DEV && typeof window !== "undefined" && window.__termsApiMock) || apiProp;
  const [state, setState] = useState({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    api(id).then((res) => alive && setState(res?.ok && res.terms ? { phase: "ready", t: res.terms } : { phase: "missing" }))
      .catch(() => alive && setState({ phase: "missing" }));
    return () => { alive = false; };
  }, [id]);
  useEffect(() => { if (state.t?.title) document.title = `${state.t.title} · Hans Infomatic`; }, [state.t]);

  const shell = (children) => (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#111827", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 60px", fontSize: 15, lineHeight: 1.55 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottom: "3px solid #1F2F6B", paddingBottom: 10 }}>
          <div style={{ fontWeight: 800, color: "#1F2F6B", letterSpacing: ".2px" }}>HANS INFOMATIC PVT. LTD.</div>
          <img src="/hans-logo.png" alt="Hans Infomatic" style={{ height: 48 }} />
        </header>
        {children}
      </main>
    </div>
  );

  if (state.phase === "loading") return shell(<div style={{ padding: 48, textAlign: "center", color: "#64748B" }}>Loading…</div>);
  if (state.phase === "missing") return shell(
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Terms not found</div>
      <div style={{ color: "#64748B" }}>This link is not active. Please ask your Hans Infomatic contact for the current terms.</div>
    </div>);

  const { t } = state;
  const blocks = eulaBlocks(t.body, { customer: "the Customer named in the Order Form", company: "Hans Infomatic Pvt. Ltd." });
  return shell(<>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <h1 style={{ color: "#1F2F6B", fontSize: 24, margin: "18px 0 4px" }}>{t.title}</h1>
      <button type="button" className="noprint" onClick={() => window.print()} style={{ marginTop: 20, border: "1px solid #CBD5E1", background: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <Printer size={14} />Print
      </button>
    </div>
    {t.updatedAt && <div style={{ color: "#64748B", fontSize: 13 }}>Last updated {new Date(t.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>}
    {blocks.map((b, i) => b.kind === "h"
      ? <h2 key={i} style={{ color: "#1F2F6B", fontSize: 17, margin: "24px 0 6px", paddingBottom: 2, borderBottom: "2px solid #3DAE49" }}>{b.text}</h2>
      : <p key={i} style={{ margin: "6px 0", whiteSpace: "pre-line" }}>{b.text}</p>)}
    <footer style={{ marginTop: 36, color: "#64748B", fontSize: 13, borderTop: "1px solid #CBD5E1", paddingTop: 10 }}>
      Hans Infomatic Pvt. Ltd. The quotation or order form accepted by the Customer is the Order Form under these terms.
    </footer>
    <style>{"@media print { .noprint { display: none !important; } }"}</style>
  </>);
}

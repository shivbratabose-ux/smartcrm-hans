// Edge Function: re-agent-run
// -----------------------------------------------------------------------------
// Customer Re-engagement Agent (Module A, R1) — the daily selection + draft
// pass. Finds accounts with no meaningful contact for N days, classifies
// them per spec §1/§4 (with the reason recorded for every decision), drafts
// a follow-up for the 'ready' ones via ai-claude, runs the guardrails in
// code, and queues everything for human review. THIS FUNCTION NEVER SENDS
// EMAIL — sending happens in the app through send-email with the approving
// user's own JWT.
//
// Invoked daily by pg_cron (schedule_re_run_v1.sql), or manually:
//   POST { }                      full run (select + draft)
//   POST { mode: "select-only" }  selection pass without AI drafting
//
// Auth: service-role bearer only.
//
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifyCandidate, draftViolations } from "./logic.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== SERVICE_ROLE) return json({ error: "Service credential required" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const audit = (ref: string, event: string, detail: Record<string, unknown> = {}) =>
    admin.from("agent_audit_events").insert({ module: "re_engagement", ref, event, actor: "agent", detail });

  try {
    const body = await req.json().catch(() => ({}));
    const { data: cfg } = await admin.from("agent_config").select("*").eq("scope", "org").maybeSingle();
    if (!cfg?.re_enabled) return json({ ok: false, skipped: "re-engagement agent is disabled (agent_config.re_enabled)" });
    if (cfg?.re_paused) return json({ ok: false, skipped: "re-engagement agent is PAUSED (agent_config.re_paused)" });

    const threshold = Number(cfg.re_inactivity_days) || 30;
    const cooldown = Number(cfg.re_cooldown_days) || 21;
    const draftCap = Number(cfg.re_draft_cap_per_run) || 20;
    const runDate = todayISO();

    // ── Selection ────────────────────────────────────────────────────
    // Base set: live accounts + their last meaningful contact.
    const { data: lastContacts, error: vErr } = await admin
      .from("v_last_meaningful_contact").select("account_id,last_contact");
    if (vErr) return json({ error: `view: ${vErr.message} — has add_re_agent_v1.sql been run?` }, 500);

    const lastByAccount = new Map((lastContacts || []).map((r: any) => [r.account_id, r.last_contact]));

    const { data: accounts } = await admin.from("accounts")
      .select("id,name,owner,status,do_not_contact,last_agent_followup_at")
      .eq("is_deleted", false).neq("status", "Inactive");

    // Accounts already carrying an open candidate are skipped outright.
    const { data: openCands } = await admin.from("re_candidates")
      .select("account_id").in("status", ["new", "drafted"]);
    const hasOpen = new Set((openCands || []).map((c: any) => c.account_id));

    const stats: Record<string, number> = {};
    const bump = (k: string) => { stats[k] = (stats[k] || 0) + 1; };
    const readyIds: string[] = [];
    let inserted = 0;

    for (const acc of accounts || []) {
      if (hasOpen.has(acc.id)) { bump("already_open"); continue; }

      const last = lastByAccount.get(acc.id) || "1900-01-01";
      const daysInactive = last === "1900-01-01" ? 9999 : daysBetween(last, runDate);
      if (daysInactive < threshold) { bump("recent_contact"); continue; }

      // Owner must be an active user, else the queue has no human.
      const { data: owner } = acc.owner
        ? await admin.from("users").select("id,active").eq("id", acc.owner).maybeSingle()
        : { data: null };
      if (!owner?.active) { bump("no_active_owner"); continue; }

      // Best contact: verified email, not opted out, contact-level DNC "No".
      const { data: contacts } = await admin.from("contacts")
        .select("id,email,email_verified,email_opt_out,do_not_contact,\"primary\"")
        .eq("account_id", acc.id).eq("is_deleted", false)
        .eq("email_verified", true).eq("email_opt_out", false)
        .neq("email", "").order("primary", { ascending: false }).limit(3);
      const contact = (contacts || []).find((c: any) => (c.do_not_contact || "No") === "No") || null;

      // Exclusion signals (each becomes an audited reason).
      const { count: hot } = await admin.from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("account_id", acc.id).eq("is_deleted", false)
        .in("status", ["Open", "In Progress", "Escalated"]).in("priority", ["High", "Critical"]);
      const { count: planned } = await admin.from("activities")
        .select("id", { count: "exact", head: true })
        .eq("account_id", acc.id).eq("is_deleted", false).eq("status", "Planned");
      const { data: lastOut } = await admin.from("comm_logs")
        .select("date").eq("account_id", acc.id).eq("is_deleted", false)
        .eq("direction", "Outbound").order("date", { ascending: false }).limit(1);
      const awaitingReplyDays = lastOut?.[0]?.date ? daysBetween(lastOut[0].date, runDate) : null;
      const inCooldown = acc.last_agent_followup_at
        ? daysBetween(acc.last_agent_followup_at, runDate) < cooldown : false;

      const { classification, reasons } = classifyCandidate({
        doNotContact: (acc.do_not_contact || "No") === "Yes",
        hasVerifiedContact: !!contact,
        openHighTicket: (hot || 0) > 0,
        openPlannedActivity: (planned || 0) > 0,
        awaitingReplyDays,
        inCooldown,
        daysInactive, thresholdDays: threshold,
      });
      // do_not_contact / cooldown / recent-outbound cases are recorded once
      // per run only when actionable for a human; pure skips just count.
      if (["do_not_contact", "insufficient", "waiting_customer"].includes(classification)) { bump(classification); continue; }

      const candId = `rec_${runDate.replace(/-/g, "")}_${acc.id}`;
      const { error: insErr } = await admin.from("re_candidates").insert({
        id: candId, run_date: runDate, account_id: acc.id,
        contact_id: contact?.id || null, owner_id: acc.owner,
        last_contact_at: last === "1900-01-01" ? null : last,
        days_inactive: Math.min(daysInactive, 9999),
        classification, selection_reasons: reasons, status: "new",
      });
      if (insErr) { bump("insert_error"); continue; }
      inserted++; bump(classification);
      await audit(candId, "selected", { account: acc.id, classification, reasons });
      if (classification === "ready") readyIds.push(candId);
    }

    // ── Drafting (capped per run) ────────────────────────────────────
    let drafted = 0, draftErrors = 0;
    if (body.mode !== "select-only") {
      for (const candId of readyIds.slice(0, draftCap)) {
        const { data: cand } = await admin.from("re_candidates").select("*").eq("id", candId).single();
        if (!cand) continue;

        // Bounded CRM context — dated one-liners, newest first.
        const [{ data: acc }, { data: con }, { data: owner }] = await Promise.all([
          admin.from("accounts").select("name,type,segment,country").eq("id", cand.account_id).single(),
          cand.contact_id ? admin.from("contacts").select("name,designation").eq("id", cand.contact_id).single() : { data: null },
          admin.from("users").select("name,role").eq("id", cand.owner_id).single(),
        ]);
        const { data: acts } = await admin.from("activities")
          .select("date,type,title,notes").eq("account_id", cand.account_id)
          .eq("is_deleted", false).eq("status", "Completed")
          .order("date", { ascending: false }).limit(6);
        const { data: opps } = await admin.from("opps")
          .select("title,stage,value,next_step").eq("account_id", cand.account_id)
          .eq("is_deleted", false).not("stage", "in", "(Won,Lost)").limit(4);
        const { data: quotes } = await admin.from("quotes")
          .select("quote_no,status,total,created_at").eq("account_id", cand.account_id)
          .eq("is_deleted", false).order("created_at", { ascending: false }).limit(3);

        const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-claude`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({
            action: "run", feature: "reEngageDraft",
            payload: {
              account: acc, contact: con, owner: owner,
              daysQuiet: cand.days_inactive,
              recentInteractions: (acts || []).map((a: any) =>
                `${a.date} · ${a.type}: ${a.title}${a.notes ? " — " + String(a.notes).slice(0, 200) : ""}`),
              openOpps: opps || [], openQuotes: quotes || [],
              productContext: "",
            },
          }),
        });
        const ai = await aiRes.json().catch(() => ({}));
        if (!ai?.ok || !ai?.result) {
          draftErrors++;
          await audit(candId, "draft_failed", { error: String(ai?.error || `HTTP ${aiRes.status}`).slice(0, 200) });
          continue;
        }
        const r = ai.result;

        // Guardrails in code (spec §5): violations don't block the row —
        // the human reviews WITH the flags visible — but a flagged draft
        // can never be mistaken for a clean one.
        const violations = draftViolations(r.emailBody);
        const riskFlags = [...(Array.isArray(r.riskFlags) ? r.riskFlags : []), ...violations];

        await admin.from("re_drafts").insert({
          id: `red_${candId}`,
          candidate_id: candId,
          crm_summary: r.crmSummary || {},
          subject_options: (r.subjectOptions || []).slice(0, 2),
          recommended_subject: r.recommendedSubject || "",
          body: r.emailBody || "",
          reasoning: r.reasoning || "",
          recommended_action: r.recommendedAction || "",
          followup_date: /^\d{4}-\d{2}-\d{2}$/.test(r.suggestedFollowUpDate || "") ? r.suggestedFollowUpDate : null,
          risk_flags: riskFlags,
        });
        await admin.from("re_candidates").update({ status: "drafted" }).eq("id", candId);
        await audit(candId, "drafted", { riskFlags: riskFlags.slice(0, 6) });
        drafted++;
      }

      // One bell per owner with fresh drafts (updates table syncs + pushes).
      const { data: fresh } = await admin.from("re_candidates")
        .select("owner_id").eq("run_date", runDate).eq("status", "drafted");
      const byOwner: Record<string, number> = {};
      (fresh || []).forEach((c: any) => { byOwner[c.owner_id] = (byOwner[c.owner_id] || 0) + 1; });
      for (const [ownerId, n] of Object.entries(byOwner)) {
        await admin.from("updates").insert({
          id: `upd_re_${runDate.replace(/-/g, "")}_${ownerId}`,
          title: `${n} re-engagement draft${n === 1 ? "" : "s"} await your review`,
          description: "Customers with no recent contact have AI-drafted follow-ups ready. Review, edit and send from the Re-engagement page — nothing sends without you.",
          category: "Task", priority: "Medium",
          created_by: "agent", recipient_mode: "users", recipient_user_ids: [ownerId],
        });
      }
    }

    const result = { ok: true, runDate, threshold, inserted, drafted, draftErrors, byClassification: stats };
    await audit(`run_${runDate}`, "run_complete", result);
    return json(result);
  } catch (e) {
    return json({ error: `Unexpected: ${(e as Error).message}` }, 500);
  }
});

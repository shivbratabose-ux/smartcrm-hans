// Edge Function: em-ingest
// -----------------------------------------------------------------------------
// Email-to-CRM Activity Agent (Module B, Phase E1) — turns an email CC'd to
// the capture mailbox (communication@hansinfomatic.com) into a concise CRM
// activity, without ever persisting the email itself.
//
// THE PRIVACY CONTRACT (spec §2/§3/§10) — enforced in this file:
//   - The raw email exists only in this function's memory during one request.
//   - Nothing content-bearing is written anywhere: not the body, not the
//     subject, not addresses, not attachment names, not the .eml. The only
//     durable rows are em_processed metadata, the AI-generated activity
//     summary, tasks, and append-only audit events.
//   - NEVER console.log email content — Supabase retains function logs.
//   - Attachments are not downloaded, opened, named, or sent to the model.
//
// E1 entry modes:
//   POST { mode: "ingest", email: {...} }   process ONE email payload.
//     Caller: the Graph poller (E2) — or a test harness / manual replay.
//     Auth: service-role bearer only.
//   POST { mode: "poll" }                    stub until the M365 app
//     registration exists; returns a clear not-configured message.
//
// email payload shape (built by the poller from Graph's message resource):
//   { messageId, receivedAt, fromAddress, toAddresses[], body,
//     hasAttachments, authenticationResults }
//
// Env (supabase secrets):
//   EM_FINGERPRINT_SECRET  — HMAC key for content-free dedupe. Required.
//   EM_MAILBOX             — capture mailbox address (fingerprint salt +
//                            self-address filtering). Required.
//   (Graph creds arrive in E2: EM_GRAPH_TENANT / _CLIENT_ID / _SECRET)
//
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  splitEmailBody, scanIdentifiers, decideMatch,
  filterAutoUpdates, summaryViolations, fingerprintEmail,
} from "./logic.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FP_SECRET = Deno.env.get("EM_FINGERPRINT_SECRET") || "";
  const MAILBOX = (Deno.env.get("EM_MAILBOX") || "communication@hansinfomatic.com").toLowerCase();

  // Service-role only: this function writes with elevated rights and its
  // input is raw mail — no browser has any business calling it.
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== SERVICE_ROLE) return json({ error: "Service credential required" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const audit = (ref: string, event: string, detail: Record<string, unknown> = {}, actor = "agent") =>
    admin.from("agent_audit_events").insert({ module: "email_agent", ref, event, actor, detail });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "ingest";

    // ── Config gate + emergency pause (spec §14) ──────────────────────
    const { data: cfg } = await admin.from("agent_config").select("*").eq("scope", "org").maybeSingle();
    if (!cfg?.em_enabled) return json({ ok: false, skipped: "email agent is disabled (agent_config.em_enabled)" });
    if (cfg?.em_paused) return json({ ok: false, skipped: "email agent is PAUSED (agent_config.em_paused)" });

    if (mode === "poll") {
      // E2 wires Microsoft Graph here. Shipping the stub keeps the cron
      // deployable now and makes the missing prerequisite loud, not silent.
      return json({ ok: false, skipped: "mailbox polling not configured yet — Graph app registration pending (E2)" });
    }
    if (mode !== "ingest") return json({ error: `Unknown mode: ${mode}` }, 400);

    const email = body.email || {};
    if (!email.messageId || !email.fromAddress) return json({ error: "email.messageId and email.fromAddress are required" }, 400);
    if (!FP_SECRET) return json({ error: "EM_FINGERPRINT_SECRET is not set" }, 503);

    // 1 ── Fingerprint first; duplicates cost nothing (spec §4).
    const fp = await fingerprintEmail(email.messageId, MAILBOX, FP_SECRET);
    const { data: dupe } = await admin.from("em_processed").select("fingerprint,status").eq("fingerprint", fp).maybeSingle();
    if (dupe) return json({ ok: true, fingerprint: fp, status: "duplicate", note: "already processed" });

    const receivedAt = email.receivedAt || new Date().toISOString();
    const row: any = {
      fingerprint: fp,
      received_at: receivedAt,
      auth_results: String(email.authenticationResults || "").slice(0, 300),
      attachment_omitted: !!email.hasAttachments,
    };

    // 2 ── Verify the sender is an active CRM user (spec §1/§2.1).
    //      Unverified mail gets NO AI processing at all.
    const fromAddr = String(email.fromAddress || "").trim().toLowerCase();
    const { data: sender } = await admin.from("users")
      .select("id, name, role, active, email")
      .eq("email", fromAddr).eq("active", true).maybeSingle();
    if (!sender) {
      row.status = "unverified_sender";
      await admin.from("em_processed").insert(row);
      await audit(fp, "rejected_unverified", { fromDomain: fromAddr.split("@")[1] || "" });
      return json({ ok: true, fingerprint: fp, status: "unverified_sender" });
    }
    row.sender_user_id = sender.id;
    await audit(fp, "verified", { userId: sender.id });

    // 3 ── Strip signatures / disclaimers / quoted bulk (spec §2.4).
    const { fresh, quoted } = splitEmailBody(email.body || "");

    // 4 ── Deterministic identifier scan before any AI (spec §4).
    const ids = scanIdentifiers(`${fresh}\n${quoted}`);
    const candidates: any[] = [];
    for (const hit of ids) {
      if (hit.type === "lead") {
        const { data } = await admin.from("leads").select("id").eq("lead_id", `#${hit.value}`).maybeSingle();
        if (data) candidates.push({ type: "lead", id: data.id, basis: `explicit id ${hit.value}`, confidence: 0.97 });
      } else if (hit.type === "opp") {
        const { data } = await admin.from("opps").select("id").eq("opp_no", hit.value).maybeSingle();
        if (data) candidates.push({ type: "opp", id: data.id, basis: `explicit id ${hit.value}`, confidence: 0.97 });
      } else if (hit.type === "quote") {
        const { data } = await admin.from("quotes").select("id, opp_id").eq("quote_no", hit.value).maybeSingle();
        if (data?.opp_id) candidates.push({ type: "opp", id: data.opp_id, basis: `quote ${hit.value}`, confidence: 0.95 });
      } else if (hit.type === "ticket") {
        const { data } = await admin.from("tickets").select("id, account_id").eq("id", hit.value).maybeSingle();
        if (data?.account_id) candidates.push({ type: "account", id: data.account_id, basis: `ticket ${hit.value}`, confidence: 0.93 });
      }
    }
    // Contact-email match: external addresses in To/CC (never stored).
    const external = (Array.isArray(email.toAddresses) ? email.toAddresses : [])
      .map((a: string) => String(a || "").trim().toLowerCase())
      .filter((a: string) => a && a !== MAILBOX && !a.endsWith("@hansinfomatic.com"));
    for (const addr of external.slice(0, 10)) {
      const { data } = await admin.from("contacts")
        .select("id, account_id").eq("email", addr).eq("is_deleted", false).limit(2);
      if (data && data.length === 1) {
        candidates.push({ type: "contact", id: data[0].id, basis: "contact email", confidence: 0.92 });
        if (data[0].account_id) candidates.push({ type: "account", id: data[0].account_id, basis: "contact's account", confidence: 0.9 });
      }
      // Unique-domain account match (spec forbids it when ambiguous).
      const domain = addr.split("@")[1];
      if (domain) {
        const { data: accs } = await admin.from("accounts")
          .select("id").ilike("website", `%${domain}%`).eq("is_deleted", false).limit(2);
        if (accs && accs.length === 1) {
          candidates.push({ type: "account", id: accs[0].id, basis: `unique domain ${domain}`, confidence: 0.8 });
        }
      }
    }

    const minAuto = Number(cfg?.em_min_match_confidence) || 0.9;
    const decision = decideMatch(candidates, minAuto);
    await audit(fp, "matched", { status: decision.status, basis: decision.match?.basis || "", candidateCount: decision.candidates.length });

    // 5 ── AI extraction (spec §2.5-§2.8). Email text goes in as untrusted
    //      data inside a fixed feature prompt; output is schema-bound.
    const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-claude`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        action: "run",
        feature: "emailToActivity",
        payload: {
          freshBody: fresh.slice(0, 12000),
          quotedContext: quoted.slice(0, 6000),
          senderIsEmployee: true,
          identifierHits: ids,
          candidateEntities: decision.candidates,
        },
      }),
    });
    const ai = await aiRes.json().catch(() => ({}));
    if (!ai?.ok || !ai?.result) {
      row.status = "failed";
      row.error = String(ai?.error || `ai-claude HTTP ${aiRes.status}`).slice(0, 300);
      await admin.from("em_processed").insert(row);
      await audit(fp, "failed", { stage: "ai", error: row.error });
      return json({ ok: false, fingerprint: fp, status: "failed", error: row.error });
    }
    const r = ai.result;

    // 6 ── Server-side validation — the model proposes, code disposes.
    const violations = summaryViolations(r.summary);
    // The model may only confirm a candidate we offered; anything else is
    // discarded (prompt-injection cannot invent a target record).
    const offered = new Set(decision.candidates.map((c: any) => `${c.type}:${c.id}`));
    const modelPick = r.matchedEntity?.entityId && offered.has(`${r.matchedEntity.entityType}:${r.matchedEntity.entityId}`)
      ? r.matchedEntity : null;
    const finalMatch = decision.match
      || (modelPick && (r.matchingConfidence || 0) >= minAuto && decision.candidates.length === 1
          ? { type: modelPick.entityType, id: modelPick.entityId, basis: "model-confirmed sole candidate", confidence: r.matchingConfidence }
          : null);

    row.direction = ["Outbound", "Inbound", "Internal"].includes(r.direction) ? r.direction : "";
    row.direction_confidence = Math.max(0, Math.min(1, Number(r.directionConfidence) || 0));
    row.extract_confidence = Math.max(0, Math.min(1, Number(r.extractConfidence) || 0));
    row.match_confidence = finalMatch ? finalMatch.confidence : (decision.candidates[0]?.confidence || 0);
    row.intent = Array.isArray(r.intent) ? r.intent.slice(0, 5) : [];
    row.sentiment = r.sentiment || "";
    row.match_candidates = decision.candidates;
    row.attachment_omitted = row.attachment_omitted || !!r.attachmentNoted;

    if (violations.length > 0 || row.extract_confidence < 0.4) {
      row.status = "needs_match";
      row.error = violations.join("; ").slice(0, 300);
    } else if (finalMatch) {
      row.status = "processed";
      row.matched_entity_type = finalMatch.type;
      row.matched_entity_id = finalMatch.id;
    } else {
      row.status = decision.status === "needs_match" ? "needs_match" : "unmatched";
    }

    // 7 ── Write the activity for clean, matched extractions (spec §5/§10).
    //      The summary is a native "Email" activity, so timelines, My
    //      Performance and Module A's meaningful-contact view all see it
    //      with zero extra code.
    if (row.status === "processed") {
      const actId = `act_em_${fp.slice(0, 12)}`;
      const attachNote = row.attachment_omitted
        ? " [This email contained an attachment that was not captured or analysed.]" : "";
      const act: any = {
        id: actId,
        type: "Email",
        status: "Completed",
        date: String(receivedAt).slice(0, 10),
        time: String(receivedAt).slice(11, 16),
        duration: "0",
        owner: sender.id,
        title: `Email — ${(r.intent || [])[0] || "General follow-up"}`,
        notes: `${r.summary}${attachNote}`,
        outcome: r.sentiment === "Negative" ? "Negative" : r.sentiment === "Positive" ? "Positive" : "Neutral",
      };
      if (finalMatch!.type === "account") act.account_id = finalMatch!.id;
      if (finalMatch!.type === "contact") {
        act.contact_id = finalMatch!.id;
        const { data: c } = await admin.from("contacts").select("account_id").eq("id", finalMatch!.id).maybeSingle();
        if (c?.account_id) act.account_id = c.account_id;
      }
      if (finalMatch!.type === "opp") {
        act.opp_id = finalMatch!.id;
        const { data: o } = await admin.from("opps").select("account_id").eq("id", finalMatch!.id).maybeSingle();
        if (o?.account_id) act.account_id = o.account_id;
      }
      if (finalMatch!.type === "lead") act.lead_id = finalMatch!.id;

      const { error: aerr } = await admin.from("activities").insert(act);
      if (aerr) {
        row.status = "failed";
        row.error = `activity insert: ${aerr.message}`.slice(0, 300);
      } else {
        row.activity_id = actId;
        await audit(fp, "activity_created", { activityId: actId, entity: `${finalMatch!.type}:${finalMatch!.id}` });

        // Follow-up tasks (spec §8) — Planned activities, deduped per email
        // by deterministic ids derived from the fingerprint.
        const tasks = (Array.isArray(r.taskRecommendations) ? r.taskRecommendations : []).slice(0, 3);
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          if (!t?.title) continue;
          await admin.from("activities").insert({
            id: `act_emt_${fp.slice(0, 12)}_${i}`,
            type: "Call",
            status: "Planned",
            date: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || "") ? t.dueDate : null,
            owner: sender.id,
            title: String(t.title).slice(0, 200),
            notes: `${String(t.description || "").slice(0, 400)} [from email activity ${actId}]`,
            account_id: act.account_id || null,
            opp_id: act.opp_id || null,
          });
        }
        if (tasks.length) await audit(fp, "tasks_created", { count: tasks.length });

        // E1 scope stops here. Auto field updates beyond the activity row
        // itself land in E2 behind filterAutoUpdates(); the allowlist is
        // imported above so the wiring is one call, not a redesign.
        void filterAutoUpdates;
      }
    }

    await admin.from("em_processed").insert(row);
    await audit(fp, "recorded", { status: row.status });
    return json({
      ok: true,
      fingerprint: fp,
      status: row.status,
      matched: row.matched_entity_type ? { type: row.matched_entity_type, id: row.matched_entity_id } : null,
      activityId: row.activity_id || null,
      candidates: decision.candidates.length,
    });
  } catch (e) {
    // Never include email content in errors — message text only.
    return json({ error: `Unexpected: ${(e as Error).message}` }, 500);
  }
});

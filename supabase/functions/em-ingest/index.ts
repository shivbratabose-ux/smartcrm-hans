// Edge Function: em-ingest
// -----------------------------------------------------------------------------
// Email-to-CRM Activity Agent (Module B, E1+E2) — turns an email CC'd to the
// capture mailbox (communication@hansinfomatic.com) into a concise CRM
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
// Modes (POST, service-role bearer only):
//   { mode: "ingest", email: {...} }  process ONE payload (tests / replay).
//   { mode: "poll" }                  E2: pull unread mail from the capture
//     mailbox via Microsoft Graph (application permission, scoped to this
//     one mailbox by ApplicationAccessPolicy), run each through the same
//     pipeline, then mark it read + categorised "CRM-Processed". Invoked
//     by pg_cron (schedule_em_poll_v1.sql) every few minutes.
//
// Env (supabase secrets):
//   EM_FINGERPRINT_SECRET   HMAC key for content-free dedupe. Required.
//   EM_MAILBOX              capture mailbox address. Required.
//   EM_GRAPH_TENANT_ID      Entra tenant — required for mode:"poll".
//   EM_GRAPH_CLIENT_ID      app registration (Mail.ReadWrite application
//   EM_GRAPH_CLIENT_SECRET  permission; ReadWrite because polling marks
//                           messages read/categorised after processing).
//
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  splitEmailBody, scanIdentifiers, decideMatch,
  filterAutoUpdates, summaryViolations, fingerprintEmail, mapGraphMessage,
} from "./logic.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Field-level writers for allowlisted auto-updates (spec §7). Only columns
// that exist get a writer; each validates its value in code. Everything the
// model proposes outside this map is rejected upstream by filterAutoUpdates
// and again here by simple absence.
const VALID_TEMPS = new Set(["Hot", "Warm", "Cool", "Cold", "Dead"]);
const AUTO_WRITERS: Record<string, { table: string; column: string; valid: (v: string) => boolean }> = {
  "lead:nextCall":    { table: "leads", column: "next_call",   valid: v => /^\d{4}-\d{2}-\d{2}$/.test(v) },
  "lead:temperature": { table: "leads", column: "temperature", valid: v => VALID_TEMPS.has(v) },
  "opp:nextStep":     { table: "opps",  column: "next_step",   valid: v => v.length > 0 && v.length <= 200 },
};

type Env = {
  SUPABASE_URL: string; SERVICE_ROLE: string;
  FP_SECRET: string; MAILBOX: string;
};

// ── The per-email pipeline (shared by ingest + poll) ─────────────────
async function processEmail(admin: any, cfg: any, env: Env, email: any) {
  const audit = (ref: string, event: string, detail: Record<string, unknown> = {}, actor = "agent") =>
    admin.from("agent_audit_events").insert({ module: "email_agent", ref, event, actor, detail });

  if (!email?.messageId || !email?.fromAddress) return { ok: false, error: "email.messageId and email.fromAddress are required" };

  // 1 ── Fingerprint first; duplicates cost nothing (spec §4).
  const fp = await fingerprintEmail(email.messageId, env.MAILBOX, env.FP_SECRET);
  const { data: dupe } = await admin.from("em_processed").select("fingerprint").eq("fingerprint", fp).maybeSingle();
  if (dupe) return { ok: true, fingerprint: fp, status: "duplicate" };

  const receivedAt = email.receivedAt || new Date().toISOString();
  const row: any = {
    fingerprint: fp,
    received_at: receivedAt,
    auth_results: String(email.authenticationResults || "").slice(0, 300),
    attachment_omitted: !!email.hasAttachments,
  };

  // 2 ── Verify the sender is an active CRM user (spec §1/§2.1).
  const fromAddr = String(email.fromAddress || "").trim().toLowerCase();
  const { data: sender } = await admin.from("users")
    .select("id, name, role, active, email")
    .eq("email", fromAddr).eq("active", true).maybeSingle();
  if (!sender) {
    row.status = "unverified_sender";
    await admin.from("em_processed").insert(row);
    await audit(fp, "rejected_unverified", { fromDomain: fromAddr.split("@")[1] || "" });
    return { ok: true, fingerprint: fp, status: "unverified_sender" };
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
  const external = (Array.isArray(email.toAddresses) ? email.toAddresses : [])
    .map((a: string) => String(a || "").trim().toLowerCase())
    .filter((a: string) => a && a !== env.MAILBOX && !a.endsWith("@hansinfomatic.com"));
  for (const addr of external.slice(0, 10)) {
    const { data } = await admin.from("contacts")
      .select("id, account_id").eq("email", addr).eq("is_deleted", false).limit(2);
    if (data && data.length === 1) {
      candidates.push({ type: "contact", id: data[0].id, basis: "contact email", confidence: 0.92 });
      if (data[0].account_id) candidates.push({ type: "account", id: data[0].account_id, basis: "contact's account", confidence: 0.9 });
    }
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

  // 5 ── AI extraction — email text as untrusted data, schema-bound output.
  const aiRes = await fetch(`${env.SUPABASE_URL}/functions/v1/ai-claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SERVICE_ROLE}` },
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
    return { ok: false, fingerprint: fp, status: "failed", error: row.error };
  }
  const r = ai.result;

  // 6 ── Server-side validation — the model proposes, code disposes.
  const violations = summaryViolations(r.summary);
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

  // 7 ── Activity + tasks + allowlisted auto-updates for clean matches.
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

      // Follow-up tasks (spec §8), deduped per email by deterministic ids.
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

      // E2 ── Allowlisted auto-updates (spec §7 permitted list). Three
      // gates, all in code: filterAutoUpdates' allowlist + confidence,
      // the update must target THE MATCHED RECORD (a model proposing a
      // different record's id is refused), and the field must have a
      // writer with a validator here. Every applied update is audited
      // with old + new values.
      const { applied, rejected } = filterAutoUpdates(r.automaticUpdates, minAuto);
      for (const u of applied) {
        const writer = AUTO_WRITERS[`${u.entityType}:${u.field}`];
        if (!writer) continue; // allowlisted but no column exists yet
        if (u.entityType !== finalMatch!.type || u.entityId !== finalMatch!.id) {
          await audit(fp, "update_refused", { field: u.field, why: "targets non-matched record" });
          continue;
        }
        const newValue = String(u.newValue || "").trim();
        if (!writer.valid(newValue)) {
          await audit(fp, "update_refused", { field: u.field, why: "value failed validation" });
          continue;
        }
        const { data: cur } = await admin.from(writer.table).select(writer.column).eq("id", u.entityId).maybeSingle();
        const oldValue = cur ? String(cur[writer.column] ?? "") : "";
        if (oldValue === newValue) continue;
        const { error: uerr } = await admin.from(writer.table)
          .update({ [writer.column]: newValue, updated_at: new Date().toISOString() })
          .eq("id", u.entityId);
        if (!uerr) {
          await audit(fp, "field_updated", {
            entity: `${u.entityType}:${u.entityId}`, field: u.field,
            oldValue: oldValue.slice(0, 120), newValue: newValue.slice(0, 120),
            reason: String(u.reason || "").slice(0, 200), confidence: u.confidence,
          });
        }
      }
      if (rejected.length) {
        await audit(fp, "updates_rejected", {
          count: rejected.length,
          fields: rejected.map((x: any) => `${x?.entityType}:${x?.field}`).slice(0, 10),
        });
      }
    }
  }

  await admin.from("em_processed").insert(row);
  await audit(fp, "recorded", { status: row.status });
  return {
    ok: true,
    fingerprint: fp,
    status: row.status,
    matched: row.matched_entity_type ? { type: row.matched_entity_type, id: row.matched_entity_id } : null,
    activityId: row.activity_id || null,
    candidates: decision.candidates.length,
  };
}

// ── Microsoft Graph (E2 polling) ─────────────────────────────────────
const GRAPH = "https://graph.microsoft.com/v1.0";
const PROCESSED_CATEGORY = "CRM-Processed";
const POLL_CAP = 20; // messages per run; cron cadence covers the rest

async function graphToken(tenant: string, clientId: string, secret: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(`Graph token: HTTP ${res.status} ${j.error || ""}`);
  return j.access_token;
}

async function pollMailbox(admin: any, cfg: any, env: Env) {
  const tenant = Deno.env.get("EM_GRAPH_TENANT_ID") || "";
  const clientId = Deno.env.get("EM_GRAPH_CLIENT_ID") || "";
  const secret = Deno.env.get("EM_GRAPH_CLIENT_SECRET") || "";
  if (!tenant || !clientId || !secret) {
    return { ok: false, skipped: "mailbox polling not configured — set EM_GRAPH_TENANT_ID / EM_GRAPH_CLIENT_ID / EM_GRAPH_CLIENT_SECRET (Graph app registration + ApplicationAccessPolicy)" };
  }

  const token = await graphToken(tenant, clientId, secret);
  const gh = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const box = encodeURIComponent(env.MAILBOX);

  // Unread = unprocessed. This is a dedicated capture mailbox; the poller
  // owns its read-state. Oldest first so a backlog drains in order; the
  // fingerprint also protects against any re-read.
  const listRes = await fetch(
    `${GRAPH}/users/${box}/messages?$filter=isRead eq false&$orderby=receivedDateTime asc&$top=${POLL_CAP}&$select=id`,
    { headers: gh });
  const listJson = await listRes.json();
  if (!listRes.ok) throw new Error(`Graph list: HTTP ${listRes.status} ${listJson?.error?.code || ""}`);
  const idsToFetch: string[] = (listJson.value || []).map((m: any) => m.id);

  const results: any[] = [];
  for (const gid of idsToFetch) {
    // Full fetch per message: internetMessageHeaders (auth-results) is only
    // available on single-message GETs. POLL_CAP bounds the extra calls.
    const mRes = await fetch(
      `${GRAPH}/users/${box}/messages/${gid}?$select=id,internetMessageId,receivedDateTime,from,sender,toRecipients,ccRecipients,body,hasAttachments,internetMessageHeaders`,
      { headers: gh });
    const msg = await mRes.json();
    let outcome: any;
    if (!mRes.ok) {
      outcome = { ok: false, status: "failed", error: `Graph get: HTTP ${mRes.status}` };
    } else {
      outcome = await processEmail(admin, cfg, env, mapGraphMessage(msg));
    }
    results.push({ status: outcome?.status || "failed", fingerprint: outcome?.fingerprint || null });

    // Mark handled regardless of outcome — unverified/failed rows are
    // recorded in em_processed and must not loop back every poll. The
    // category makes state visible to a human opening the mailbox.
    await fetch(`${GRAPH}/users/${box}/messages/${gid}`, {
      method: "PATCH", headers: gh,
      body: JSON.stringify({ isRead: true, categories: [PROCESSED_CATEGORY] }),
    });
  }

  return {
    ok: true,
    polled: idsToFetch.length,
    byStatus: results.reduce((m: any, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {}),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env: Env = {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL")!,
    SERVICE_ROLE: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    FP_SECRET: Deno.env.get("EM_FINGERPRINT_SECRET") || "",
    MAILBOX: (Deno.env.get("EM_MAILBOX") || "communication@hansinfomatic.com").toLowerCase(),
  };

  // Service-role only: this function writes with elevated rights and its
  // input is raw mail — no browser has any business calling it.
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== env.SERVICE_ROLE) return json({ error: "Service credential required" }, 401);

  const admin = createClient(env.SUPABASE_URL, env.SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "ingest";

    const { data: cfg } = await admin.from("agent_config").select("*").eq("scope", "org").maybeSingle();
    if (!cfg?.em_enabled) return json({ ok: false, skipped: "email agent is disabled (agent_config.em_enabled)" });
    if (cfg?.em_paused) return json({ ok: false, skipped: "email agent is PAUSED (agent_config.em_paused)" });
    if (!env.FP_SECRET) return json({ error: "EM_FINGERPRINT_SECRET is not set" }, 503);

    if (mode === "poll") return json(await pollMailbox(admin, cfg, env));
    if (mode !== "ingest") return json({ error: `Unknown mode: ${mode}` }, 400);
    return json(await processEmail(admin, cfg, env, body.email || {}));
  } catch (e) {
    // Never include email content in errors — message text only.
    return json({ error: `Unexpected: ${(e as Error).message}` }, 500);
  }
});

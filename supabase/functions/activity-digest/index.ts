// Edge Function: activity-digest
// -----------------------------------------------------------------------------
// Daily and weekly activity e-mails. One e-mail per person per run, with
// sections chosen by who they are (see ./logic.js): their own activity and
// today's plan, their team (if they have direct reports), and a company
// roll-up for MD / Director / VP Sales plus DIGEST_ROLLUP_USERS.
//
// Scheduled by pg_cron (supabase/activity_digest_v1.sql), 08:30 IST:
//   daily   Mon–Sat, skipped on holidays; covers everything since the
//           previous report (Monday covers Sat + Sun)
//   weekly  Monday; covers the previous Mon–Sun, compared with the week before
//
// POST { kind: "daily" | "weekly", mode: "send" | "dry-run", today?: "YYYY-MM-DD", only?: userId }
//   dry-run  builds every e-mail and returns them; sends nothing, logs nothing.
//            `today` lets a dry run replay any date.
//
// Auth: a narrow shared token (DIGEST_CRON_TOKEN), not the service key, so the
// cron job's stored SQL can only ever trigger a digest. Deployed with
// --no-verify-jwt; fails closed when the token isn't configured.
//
// Rollout: while DIGEST_PREVIEW_TO is set, every e-mail goes to that address
// instead, subject prefixed "[Preview → Name]". Unset it to go live.
//
// Secrets: DIGEST_CRON_TOKEN (required), DIGEST_PREVIEW_TO, DIGEST_ROLLUP_USERS
// (comma list of users.id, default "u1"), APP_URL, and the mail secrets in
// ../_shared/graphMail.ts.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { planDigests, dailyPeriod, weeklyPeriod, isSendDay, addDays } from "./logic.js";
import { mailConfigured, sendMail } from "../_shared/graphMail.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0; for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i];
  return d === 0;
}
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// Read every matching row: PostgREST caps a response at 1000 rows.
async function all(q: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const expected = Deno.env.get("DIGEST_CRON_TOKEN") || "";
  if (expected.length < 24) return json({ error: "Digest not configured" }, 503);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(bearer, expected)) return json({ error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body = defaults */ }
  const kind = body.kind === "weekly" ? "weekly" : "daily";
  const dryRun = body.mode !== "send";
  const today = dryRun && /^\d{4}-\d{2}-\d{2}$/.test(body.today || "") ? body.today : istToday();

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: settings } = await admin.from("app_settings").select("masters").eq("scope", "org").maybeSingle();
  const holidays = settings?.masters?.holidays || [];
  const stages = settings?.masters?.stages || [];

  if (kind === "daily" && !isSendDay(today, holidays)) {
    return json({ ok: true, skipped: `No daily report on ${today} (Sunday or holiday).` });
  }

  // Data window: the report period (plus the comparison week for weekly),
  // through today for the "today" plan.
  const p = kind === "weekly" ? weeklyPeriod(today) : dailyPeriod(today, holidays);
  const from = kind === "weekly" ? addDays(p.from, -7) : p.from;

  try {
    const [users, activities, callReports, events, leads, opps, quotes] = await Promise.all([
      all(() => admin.from("users").select("id, name, email, role, reports_to, active").order("id")),
      all(() => admin.from("activities").select("id, owner, date, time, type, status, title, is_deleted")
        .or(`date.gte.${from},and(status.eq.Planned,date.lt.${from})`).lte("date", today).order("id")),
      all(() => admin.from("call_reports").select("id, marketing_person, participant_ids, call_type, call_date, outcome, is_deleted")
        .gte("call_date", from).lte("call_date", today).order("id")),
      all(() => admin.from("events").select("id, owner, date, time, end_time, type, status, title, is_deleted")
        .gte("date", from).lte("date", today).order("id")),
      all(() => admin.from("leads").select("id, owner, company, contact_name, product, source, stage, created_date, next_call, is_deleted")
        .eq("is_deleted", false).or(`created_date.gte.${from},next_call.lte.${today}`).order("id")),
      all(() => admin.from("opportunities").select("id, owner, stage, value, close_date, created_date, is_deleted")
        .eq("is_deleted", false).or(`close_date.gte.${from},created_date.gte.${from}`).order("id")),
      all(() => admin.from("quotations").select("id, owner, sent_date, is_deleted")
        .eq("is_deleted", false).gte("sent_date", from).order("id")),
    ]);

    const data = {
      users: users.map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role, reportsTo: u.reports_to, active: u.active })),
      activities: activities.map((a: any) => ({ owner: a.owner, date: a.date, time: a.time, type: a.type, status: a.status, title: a.title, isDeleted: a.is_deleted })),
      callReports: callReports.map((r: any) => ({ marketingPerson: r.marketing_person, participantIds: r.participant_ids, callType: r.call_type, callDate: r.call_date, outcome: r.outcome, isDeleted: r.is_deleted })),
      events: events.map((e: any) => ({ owner: e.owner, date: e.date, time: e.time, endTime: e.end_time, type: e.type, status: e.status, title: e.title, isDeleted: e.is_deleted })),
      leads: leads.map((l: any) => ({ id: l.id, owner: l.owner, company: l.company, contact: l.contact_name, product: l.product, source: l.source, stage: l.stage, createdDate: l.created_date, nextCall: l.next_call || "", isDeleted: l.is_deleted })),
      opps: opps.map((o: any) => ({ owner: o.owner, stage: o.stage, value: o.value, closeDate: o.close_date, createdDate: o.created_date, isDeleted: o.is_deleted })),
      quotes: quotes.map((q: any) => ({ owner: q.owner, sentDate: q.sent_date, isDeleted: q.is_deleted })),
    };

    const rollupUserIds = (Deno.env.get("DIGEST_ROLLUP_USERS") ?? "u1").split(",").map(s => s.trim()).filter(Boolean);
    const plan = planDigests({ kind, today, data, holidays, stages, rollupUserIds, appUrl: Deno.env.get("APP_URL") || "https://smartcrm-hans.vercel.app" });
    const messages = body.only ? plan.messages.filter((m: any) => m.recipient.id === body.only) : plan.messages;
    const periodKey = `${p.from}..${p.to}`;

    if (dryRun) {
      return json({
        ok: true, mode: "dry-run", kind, today, period: plan.period, count: messages.length,
        messages: messages.map((m: any) => ({ id: m.recipient.id, name: m.recipient.name, role: m.recipient.role,
          sections: m.sections.map((s: any) => s.type), subject: m.subject, html: m.html })),
      });
    }

    if (!mailConfigured()) return json({ error: "Mail not configured (Microsoft Graph secrets missing)" }, 503);
    const preview = (Deno.env.get("DIGEST_PREVIEW_TO") || "").trim();
    const results: any[] = [];
    for (const m of messages) {
      // Claim first: a retried cron call never sends the same report twice.
      const { error: claimErr } = await admin.from("digest_log").insert({
        kind, period_key: periodKey, recipient_id: m.recipient.id, outcome: "sending",
        sent_to: preview || m.recipient.email,
      });
      if (claimErr) { results.push({ id: m.recipient.id, outcome: claimErr.code === "23505" ? "already-sent" : "log-error" }); continue; }
      try {
        await sendMail({
          to: preview || m.recipient.email,
          subject: preview ? `[Preview → ${m.recipient.name}] ${m.subject}` : m.subject,
          html: m.html,
          headers: { "X-SmartCRM-Digest": kind },
        });
        await admin.from("digest_log").update({ outcome: "sent" })
          .eq("kind", kind).eq("period_key", periodKey).eq("recipient_id", m.recipient.id);
        results.push({ id: m.recipient.id, outcome: "sent" });
      } catch (e: any) {
        await admin.from("digest_log").update({ outcome: "error", error: String(e?.message || e).slice(0, 500) })
          .eq("kind", kind).eq("period_key", periodKey).eq("recipient_id", m.recipient.id);
        results.push({ id: m.recipient.id, outcome: "error" });
      }
    }
    return json({ ok: true, mode: "send", kind, period: plan.period, preview: !!preview,
      sent: results.filter(r => r.outcome === "sent").length, results });
  } catch (e: any) {
    return json({ error: String(e?.message || e).slice(0, 500) }, 500);
  }
});

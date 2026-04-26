// Edge Function: notify-followups
// ─────────────────────────────────────────────────────────────────────────────
// Sends a daily push notification to every CRM user with an Expo Push token,
// summarising what's on their plate for today (followups + meetings + tasks).
//
// Designed to be triggered by a Supabase scheduled function (cron) at 9 AM
// per the org's default timezone. Can also be invoked manually for debugging:
//
//   curl -X POST https://<project>.supabase.co/functions/v1/notify-followups \
//     -H "Authorization: Bearer <service-role-key>"
//
// Payload sent to each device (Expo's standard message shape):
//   {
//     to:    "ExponentPushToken[xxxxxxxxxxxx]",
//     sound: "default",
//     title: "3 follow-ups, 1 meeting today",
//     body:  "Tap to see what's on your plate.",
//     data:  { kind: "daily_followup", filter: "today" }
//   }
//
// The data.filter hint lets the mobile app deep-link into Plan tab with
// the right chip pre-selected when the user taps the push.
//
// Rate limits: Expo allows 600 messages per second per app. We send in
// batches of 100 (Expo's recommended chunk size) using their /push/send
// endpoint. The function loops over users at most ~once per day so even
// 10,000 users would be a single ~100-batch cycle.
//
// Env required:
//   SUPABASE_URL                 (auto)
//   SUPABASE_SERVICE_ROLE_KEY    (auto — bypass RLS to read all users)
//   EXPO_ACCESS_TOKEN            (optional — only needed if you've turned
//                                 on enhanced push security in Expo dashboard)

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural || singular + "s")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = todayIso();

  // ── 1. Pull every active user that has a push token ────────────────
  const { data: users, error: uErr } = await admin
    .from("users")
    .select("id, name, email, expo_push_token")
    .eq("active", true)
    .not("expo_push_token", "is", null);

  if (uErr) return json({ error: `users query failed: ${uErr.message}` }, 500);
  if (!users || users.length === 0) return json({ ok: true, dispatched: 0, reason: "no users with push tokens" });

  // ── 2. Build per-user counts (followups + meetings + tasks for today) ──
  // Done in one pass each: for each user, three head-only count queries.
  // We could fan out a single query that joins on owner if performance
  // becomes a problem, but counting 50 users at <100ms each is fine.
  type Bucket = { followups: number; meetings: number; tasks: number };
  const counts: Record<string, Bucket> = {};

  await Promise.all(users.map(async (u: any) => {
    const [fRes, mRes, tRes] = await Promise.all([
      admin.from("leads")     .select("id", { count: "exact", head: true })
            .eq("is_deleted", false).eq("next_call", today).eq("owner", u.id),
      admin.from("events")    .select("id", { count: "exact", head: true })
            .eq("is_deleted", false).eq("date", today).eq("owner", u.id),
      admin.from("activities").select("id", { count: "exact", head: true })
            .eq("is_deleted", false).eq("date", today).eq("status", "Planned").eq("owner", u.id),
    ]);
    counts[u.id] = {
      followups: fRes.count || 0,
      meetings:  mRes.count || 0,
      tasks:     tRes.count || 0,
    };
  }));

  // ── 3. Build Expo push messages, skipping users with nothing today ──
  const messages: any[] = [];
  const logRows: any[] = [];
  for (const u of users as any[]) {
    const c = counts[u.id];
    if (!c || c.followups + c.meetings + c.tasks === 0) {
      // Don't send "you have 0 things today" — annoying.
      continue;
    }
    const parts = [
      c.followups > 0 ? pluralize(c.followups, "follow-up") : null,
      c.meetings  > 0 ? pluralize(c.meetings,  "meeting")   : null,
      c.tasks     > 0 ? pluralize(c.tasks,     "task")      : null,
    ].filter(Boolean);
    const title = parts.join(", ") + " today";
    const body  = "Tap to see what's on your plate.";
    messages.push({
      to: u.expo_push_token,
      sound: "default",
      title,
      body,
      data: { kind: "daily_followup", filter: "today" },
      // Expo grouping lets users see them stacked; same channelId on
      // Android groups under one notification line.
      channelId: "default",
      priority: "high",
    });
    logRows.push({
      user_id: u.id,
      channel: "expo_push",
      kind:    "daily_followup",
      title,
      body,
      payload: { followups: c.followups, meetings: c.meetings, tasks: c.tasks },
    });
  }

  if (messages.length === 0) {
    return json({ ok: true, dispatched: 0, reason: "no users had items today" });
  }

  // ── 4. POST to Expo in chunks of 100 ────────────────────────────────
  const expoResults: any[] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          ...(EXPO_ACCESS_TOKEN ? { "Authorization": `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk),
      });
      const body = await res.json().catch(() => ({}));
      expoResults.push(...(body.data || []));
    } catch (e) {
      // Continue with next batch even if one fails — better than dropping
      // everyone's reminder because batch 3 of 5 had a transient network blip.
      console.error("Expo push batch failed:", e);
    }
  }

  // ── 5. Persist to notification_log so we have a paper trail ─────────
  // Stitch each Expo ticket back to its log row by index — safe because
  // we built `messages` and `logRows` in lockstep.
  const enrichedLogRows = logRows.map((row, idx) => {
    const ticket = expoResults[idx];
    return {
      ...row,
      expo_status:   ticket?.status || null,
      expo_message:  ticket?.message || null,
      expo_ticket_id: ticket?.id || null,
    };
  });
  const { error: logErr } = await admin.from("notification_log").insert(enrichedLogRows);
  if (logErr) {
    // Non-fatal — push went out; we just lost the audit row. Worth
    // flagging in the response so the caller can investigate.
    console.error("notification_log insert failed:", logErr);
  }

  return json({
    ok: true,
    dispatched: messages.length,
    log_inserted: !logErr,
  });
});

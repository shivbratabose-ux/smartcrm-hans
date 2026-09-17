// Edge Function: notify-leave
// -----------------------------------------------------------------------------
// Emails about leave approvals (Calendar → Leave in the app):
//   { kind: "requested", ownerId, type, dates[], reason? }
//       caller = the person requesting → emails their line manager
//       (users.reports_to), or active admins if there is none.
//   { kind: "decided", ownerId, type, dates[], decision, note? }
//       caller = an approver (line manager / above / global role) →
//       emails the person who asked.
// Recipients are resolved server-side from `users` (logic.mjs) — the client
// never chooses who gets mail. The leave itself is saved by the app; this
// function only sends the email, so a send failure never blocks approval.
//
// Mail provider — first one configured wins:
//   1. Microsoft 365 via Graph (sends from a company mailbox)
//        NOTIFY_FROM_MAILBOX       communication@hansinfomatic.com (shared
//                                  with the Email Agent — see NOTIFY_HEADERS)
//        NOTIFY_GRAPH_TENANT_ID    ┐ app registration with Mail.Send
//        NOTIFY_GRAPH_CLIENT_ID    │ (application), ideally limited to that
//        NOTIFY_GRAPH_CLIENT_SECRET┘ mailbox by ApplicationAccessPolicy.
//                                  Falls back to EM_GRAPH_* if unset.
//   2. Resend
//        RESEND_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME (optional)
// Neither configured → 200 { ok:false, skipped:"not_configured" }.
//
//   APP_URL   link in the email (default https://smartcrm-hans.vercel.app)
//
// Never logs email content or addresses.
//
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { validatePayload, resolveRecipients, buildEmail } from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const env = (k: string) => (Deno.env.get(k) || "").trim();

function htmlToText(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
}

// The From mailbox (communication@) is also the Email Agent's capture
// inbox. Ask Exchange/Outlook not to send out-of-office replies, and tag
// the message so em-ingest recognises SmartCRM's own mail.
const NOTIFY_HEADERS: Record<string, string> = { "X-Auto-Response-Suppress": "All", "X-SmartCRM-Notification": "leave" };
const GRAPH_HEADERS = Object.entries(NOTIFY_HEADERS).map(([name, value]) => ({ name, value }));

type Mail ={ to: { name: string; email: string }[]; subject: string; html: string; replyTo?: string };

async function sendGraph(m: Mail): Promise<void> {
  const mailbox = env("NOTIFY_FROM_MAILBOX");
  const tenant = env("NOTIFY_GRAPH_TENANT_ID") || env("EM_GRAPH_TENANT_ID");
  const clientId = env("NOTIFY_GRAPH_CLIENT_ID") || env("EM_GRAPH_CLIENT_ID");
  const secret = env("NOTIFY_GRAPH_CLIENT_SECRET") || env("EM_GRAPH_CLIENT_SECRET");
  const tok = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const tj = await tok.json().catch(() => ({}));
  if (!tok.ok || !tj.access_token) throw new Error(`Graph token failed (HTTP ${tok.status} ${tj.error || ""})`);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tj.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: "HTML", content: m.html },
        toRecipients: m.to.map(r => ({ emailAddress: { address: r.email, name: r.name } })),
        ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo } }] } : {}),
        internetMessageHeaders: GRAPH_HEADERS,
      },
      saveToSentItems: false,
    }),
  });
  if (res.status !== 202) {
    const ej = await res.json().catch(() => ({}));
    throw new Error(`Graph sendMail failed (HTTP ${res.status} ${ej?.error?.code || ""})`);
  }
}

async function sendResend(m: Mail): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${env("EMAIL_FROM_NAME") || "SmartCRM"} <${env("EMAIL_FROM_ADDRESS")}>`,
      to: m.to.map(r => r.email), subject: m.subject, html: m.html, text: htmlToText(m.html),
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      headers: NOTIFY_HEADERS,
    }),
  });
  if (!res.ok) {
    const ej = await res.json().catch(() => ({}));
    throw new Error(`Resend rejected (HTTP ${res.status} ${ej?.name || ""})`);
  }
}

function provider(): "graph" | "resend" | null {
  if (env("NOTIFY_FROM_MAILBOX") && (env("NOTIFY_GRAPH_CLIENT_ID") || env("EM_GRAPH_CLIENT_ID"))) return "graph";
  if (env("RESEND_API_KEY") && env("EMAIL_FROM_ADDRESS")) return "resend";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Caller must be a signed-in, active CRM user.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Missing Authorization bearer token" }, 401);
    const { data: au, error: aerr } = await admin.auth.getUser(jwt);
    if (aerr || !au?.user) return json({ error: "Invalid session" }, 401);

    const { data: users, error: uerr } = await admin.from("users").select("id, name, email, role, reports_to, active, auth_user_id");
    if (uerr || !users) return json({ error: "Could not load users" }, 500);
    const caller = users.find((u: any) => u.auth_user_id === au.user.id);
    if (!caller || caller.active === false) return json({ error: "Caller has no active CRM profile" }, 403);

    // 2. Validate + resolve recipients (server-side only).
    const body = await req.json().catch(() => null);
    const bad = validatePayload(body);
    if (bad) return json({ error: bad }, 400);
    const r = resolveRecipients({ kind: body.kind, callerId: caller.id, ownerId: body.ownerId, users });
    if (!r.ok) return json({ error: r.error }, r.status);

    const p = provider();
    if (!p) return json({ ok: false, skipped: "not_configured" });

    // 3. Compose + send.
    const owner = users.find((u: any) => u.id === body.ownerId);
    const mail = buildEmail({
      kind: body.kind, owner, actor: caller, recipient: r.to[0], type: body.type, dates: body.dates,
      reason: String(body.reason || "").slice(0, 500), decision: body.decision, note: String(body.note || "").slice(0, 500),
      time: body.time, endTime: body.endTime, purpose: String(body.purpose || "").slice(0, 120),
      appUrl: env("APP_URL") || "https://smartcrm-hans.vercel.app",
    });
    // Replies go to the other party (manager ↔ requester), not a no-reply box.
    const replyTo = body.kind === "requested" ? owner?.email : caller.email;
    await (p === "graph" ? sendGraph : sendResend)({ to: r.to, subject: mail.subject, html: mail.html, replyTo: replyTo || undefined });

    return json({ ok: true, provider: p, sentTo: r.to.map((u: any) => u.name), fallback: r.fallback || null });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 502);
  }
});

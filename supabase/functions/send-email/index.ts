// Edge Function: send-email
// -----------------------------------------------------------------------------
// Sends transactional / business email via Resend on behalf of the calling
// CRM user. Designed for the SmartCRM Communications tab + per-record actions
// (e.g. "Email Quote" from the Quotation detail panel).
//
// Why Resend?
//   - Modern, simple HTTP API (single POST, JSON in / JSON out).
//   - Per-domain DKIM/SPF auto-handled.
//   - Reasonable free tier (100/day) for an internal CRM.
//   - Easy to swap for SendGrid / Postmark later: only this file changes; the
//     edge function contract (POST { to, subject, html, replyTo, ... }) stays
//     the same.
//
// Auth model:
//   - Caller must send their Supabase JWT as Authorization: Bearer <token>.
//   - We verify the JWT, look up the caller in `users`, ensure they're active,
//     and use their email + name as Reply-To (so customer replies land in the
//     rep's actual inbox). Senders that aren't active CRM users are rejected.
//
// Why does this NOT write to comm_log directly?
//   - The CRM's communications log is part of the JSONB app state, not a
//     relational table. The client owns that mutation via setCommLogs +
//     saveState. Having two writers would race.
//   - This function is a pure outbox: take a payload, send via Resend, return
//     { ok, messageId } so the client can append a CommLog entry locally.
//
// Required env vars (set via `supabase secrets set ...`):
//   RESEND_API_KEY       — Resend secret key (re_xxx). Required.
//   EMAIL_FROM_ADDRESS   — From address. Must be on a Resend-verified domain.
//                          Example: "noreply@smartcrm.hansinfomatic.com"
//   EMAIL_FROM_NAME      — Display name for From, e.g. "SmartCRM"
//                          Optional, defaults to "SmartCRM".
//
// Auto-injected by Supabase:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY (only used to look up caller profile bypassing RLS)
//
// Deployment:
//   supabase functions deploy send-email
//   supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM_ADDRESS=noreply@... EMAIL_FROM_NAME="SmartCRM"

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Strip HTML tags for the auto-generated text fallback. Resend sends both
// html + text in a multipart message when both are provided, which improves
// deliverability and renders cleanly in clients that block HTML.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Basic email validation — rejects obvious garbage early so we don't burn
// Resend quota on bounces. Not a full RFC-5322 validator (which is impossible
// in a regex anyway) but catches the 99% of typos.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmail(s: unknown): s is string {
  return typeof s === "string" && EMAIL_RE.test(s.trim());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS");
    const FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") || "SmartCRM";

    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY not configured on the server" }, 500);
    }
    if (!FROM_ADDRESS) {
      return json({ error: "EMAIL_FROM_ADDRESS not configured on the server" }, 500);
    }

    // 1. Verify the caller is an active CRM user.
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Missing Authorization bearer token" }, 401);

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userInfo, error: uerr } = await asCaller.auth.getUser();
    if (uerr || !userInfo?.user) return json({ error: "Invalid session" }, 401);

    const callerAuthId = userInfo.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: cperr } = await admin
      .from("users")
      .select("id, name, email, active")
      .eq("auth_user_id", callerAuthId)
      .single();
    if (cperr || !callerProfile) {
      return json({ error: "Caller has no CRM profile" }, 403);
    }
    if (!callerProfile.active) {
      return json({ error: "Caller is deactivated" }, 403);
    }

    // 2. Parse + validate the request body.
    const body = await req.json().catch(() => ({}));
    const to: string | string[] = body.to;
    const subject: string | undefined = body.subject;
    const html: string | undefined = body.html;
    const cc: string | string[] | undefined = body.cc;
    const bcc: string | string[] | undefined = body.bcc;
    const replyToOverride: string | undefined = body.replyTo;
    const attachmentUrls: string[] | undefined = body.attachmentUrls;

    if (!to || (Array.isArray(to) ? to.length === 0 : !validEmail(to))) {
      return json({ error: "to is required and must be a valid email" }, 400);
    }
    if (Array.isArray(to) && !to.every(validEmail)) {
      return json({ error: "All recipients in `to` must be valid emails" }, 400);
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return json({ error: "subject is required" }, 400);
    }
    if (!html || typeof html !== "string" || !html.trim()) {
      return json({ error: "html body is required" }, 400);
    }

    // Reply-To defaults to the rep's own email so customer replies don't land
    // on a no-reply mailbox. Caller can override (e.g. for shared inboxes).
    const replyTo = replyToOverride && validEmail(replyToOverride)
      ? replyToOverride
      : callerProfile.email;

    // 3. Send via Resend.
    //    Docs: https://resend.com/docs/api-reference/emails/send-email
    const resendBody: Record<string, unknown> = {
      from: `${FROM_NAME} <${FROM_ADDRESS}>`,
      to: Array.isArray(to) ? to : [to],
      subject: subject.trim(),
      html,
      text: htmlToText(html),
      reply_to: replyTo,
    };
    if (cc) resendBody.cc = Array.isArray(cc) ? cc : [cc];
    if (bcc) resendBody.bcc = Array.isArray(bcc) ? bcc : [bcc];

    // Optional attachments — Resend accepts URL or base64 content. We forward
    // URLs as-is so the client can pass already-uploaded supabase storage URLs.
    if (Array.isArray(attachmentUrls) && attachmentUrls.length > 0) {
      resendBody.attachments = attachmentUrls.map((u, i) => ({
        path: u,
        filename: u.split("/").pop() || `attachment-${i + 1}`,
      }));
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });
    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      // Surface Resend's error message so the client can show something
      // actionable ("from address not verified", "rate limit", etc.).
      const msg = resendData?.message || resendData?.name || "Unknown Resend error";
      return json({ error: `Resend rejected: ${msg}`, detail: resendData }, 502);
    }

    return json({
      ok: true,
      messageId: resendData?.id || null,
      from: `${FROM_NAME} <${FROM_ADDRESS}>`,
      replyTo,
      sentAt: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: `Unexpected: ${(e as Error).message}` }, 500);
  }
});

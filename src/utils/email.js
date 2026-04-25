// ─────────────────────────────────────────────────────────────────────────────
// Email helpers — variable interpolation + send-email edge function client
// ─────────────────────────────────────────────────────────────────────────────
// This file is the only thing that talks to the `send-email` Supabase edge
// function from the browser. Everything else (modals, buttons, action handlers)
// goes through `sendEmail()` here so we have a single chokepoint for:
//   - prepending the user's auth header
//   - error normalisation (server returns various shapes; we collapse to
//     `{ ok, messageId, error }`)
//   - graceful fallback when Supabase isn't configured (dev-only)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Resolve a dotted path like "contact.firstName" against a context object.
// Returns "" for missing values rather than "undefined" so half-filled
// previews don't show literal "undefined" strings.
function getPath(ctx, path) {
  const parts = path.split(".");
  let v = ctx;
  for (const p of parts) {
    if (v == null) return "";
    v = v[p];
  }
  return v == null ? "" : String(v);
}

/**
 * Replace every {{path.to.value}} in the input with the resolved value
 * from the given context object. Unknown paths render empty (not literal
 * "undefined") so partially-filled previews remain readable.
 *
 *   interpolate("Hi {{contact.firstName}}", { contact: { firstName: "Anita" }})
 *   → "Hi Anita"
 */
export function interpolate(input, ctx) {
  if (!input) return "";
  return String(input).replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_m, path) => getPath(ctx, path));
}

/**
 * Build a `firstName` from a full name without mutating the source.
 * Used everywhere the templates reference {{contact.firstName}} so the
 * caller doesn't have to split names manually before sending.
 */
export function withFirstName(person) {
  if (!person) return person;
  if (person.firstName) return person;
  const name = String(person.name || "").trim();
  const firstName = name.split(/\s+/)[0] || name;
  return { ...person, firstName };
}

/**
 * Send an email via the edge function. Returns { ok, messageId, error }.
 *
 * Required:
 *   to       string | string[] — recipient email(s)
 *   subject  string             — already-interpolated subject line
 *   html     string             — already-interpolated HTML body
 *
 * Optional:
 *   cc, bcc      — same shape as `to`
 *   replyTo      — defaults to the sending rep's email (server-side)
 *   attachmentUrls — array of public URLs to attach
 *
 * NOTE: this does NOT write to the comm log. The caller is responsible
 * for appending a CommLog entry on success — keeps the JSONB state
 * mutation in the React layer where it belongs.
 */
export async function sendEmail({ to, subject, html, cc, bcc, replyTo, attachmentUrls }) {
  if (!isSupabaseConfigured) {
    // Dev-mode fallback: echo to the console so the developer can verify the
    // payload without a live Resend account. Not a "send".
    // eslint-disable-next-line no-console
    console.warn("[sendEmail] Supabase not configured — would have sent:", {
      to, subject, htmlPreview: String(html).slice(0, 200),
    });
    return { ok: false, error: "Supabase not configured. Email would have been sent in production." };
  }

  // Pull the current session so the edge function can identify the rep.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Not signed in. Please log in again." };
  }

  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { to, subject, html, cc, bcc, replyTo, attachmentUrls },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    // supabase-js wraps non-2xx responses in `error` but ALSO surfaces the
    // server's JSON body in `data` for inspection. Prefer the server error
    // message when present so users see "Resend rejected: ..." instead of
    // a generic "Edge Function returned a non-2xx status code".
    if (error) {
      const serverMsg = data?.error || error.message;
      return { ok: false, error: serverMsg };
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error || "Unknown error" };
    }
    return {
      ok: true,
      messageId: data.messageId,
      from: data.from,
      replyTo: data.replyTo,
      sentAt: data.sentAt,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

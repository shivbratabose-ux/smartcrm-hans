# send-email — Supabase Edge Function

Sends transactional / business email via [Resend](https://resend.com) on behalf of the calling CRM user. Powers the **Send Email** button in the Communications tab and the **Email Quote** button on the Quote detail panel.

## What it does

1. Verifies the caller is an active CRM user (Supabase JWT → `users` table lookup)
2. Validates the payload (`to`, `subject`, `html` required; recipients must look like real emails)
3. Posts to Resend's `/emails` endpoint with the configured `From` address
4. Returns `{ ok, messageId, from, replyTo, sentAt }` on success or `{ error, detail }` on failure
5. Reply-To defaults to the rep's own email so customer replies don't land in a no-reply mailbox

It does **not** write to the `comm_log` JSONB state — the React client appends a `CommLog` entry on success (see `SendEmailModal.onSent` in `src/components/shared.jsx`).

## Required env vars

Set via `supabase secrets set ...`:

| Var | Required | Example | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | yes | `re_xxx_xxx` | Get from https://resend.com/api-keys |
| `EMAIL_FROM_ADDRESS` | yes | `noreply@smartcrm.hansinfomatic.com` | Must be on a Resend-verified domain |
| `EMAIL_FROM_NAME` | no | `SmartCRM` | Defaults to `SmartCRM` if unset |

Auto-injected by Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Deploy

```bash
# 1. Set the secrets (one-time, or whenever they rotate)
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  EMAIL_FROM_ADDRESS=noreply@smartcrm.hansinfomatic.com \
  EMAIL_FROM_NAME="SmartCRM"

# 2. Deploy the function
supabase functions deploy send-email
```

## Verify the From domain in Resend

Before any email will actually deliver:

1. In Resend dashboard → **Domains** → **Add Domain** → enter `smartcrm.hansinfomatic.com` (or whatever subdomain you'll send from)
2. Add the DKIM CNAME records to your DNS (Resend will show you the exact values)
3. Wait for verification (usually < 10 minutes)
4. Set `EMAIL_FROM_ADDRESS` to anything `@` that domain

Sending from an unverified domain returns a 403 from Resend; the edge function will surface that as `Resend rejected: ...` to the user.

## Request shape (from the browser)

```ts
POST /functions/v1/send-email
Authorization: Bearer <user JWT>
Content-Type: application/json

{
  "to": "customer@example.com",      // string or string[]
  "subject": "Your quotation Q-2026-001",
  "html": "<html>…</html>",
  "cc": [],                          // optional
  "bcc": [],                         // optional
  "replyTo": "anita@hansinfomatic.com", // optional, defaults to caller's email
  "attachmentUrls": []               // optional, public URLs Resend can fetch
}
```

## Response

**Success (200):**
```json
{
  "ok": true,
  "messageId": "abc123-resend-id",
  "from": "SmartCRM <noreply@…>",
  "replyTo": "anita@hansinfomatic.com",
  "sentAt": "2026-04-25T13:30:00.000Z"
}
```

**Failure (4xx / 5xx):**
```json
{
  "error": "Resend rejected: from address not verified",
  "detail": { /* raw Resend error body */ }
}
```

## Switching providers

The edge function has a single `fetch("https://api.resend.com/emails", …)` block. To swap to SendGrid / Postmark / SES:

1. Replace that block with the new provider's request
2. Map the response shape to `{ ok, messageId, from, replyTo, sentAt }`
3. Rename the env var (`SENDGRID_API_KEY` etc.) and re-deploy

The browser contract (request/response shape) doesn't change, so no client code needs to be touched.

## Local dev (no Resend account)

If `VITE_SUPABASE_URL` is unset, `src/utils/email.js` short-circuits and logs the would-be payload to the browser console rather than calling the function. So you can develop the modal UI without a live Resend account — just check the console after clicking Send.

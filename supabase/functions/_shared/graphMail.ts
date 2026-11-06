// Shared Microsoft 365 mail sender (Microsoft Graph, app-only).
// -----------------------------------------------------------------------------
// Sends from a Hans mailbox (default communication@hansinfomatic.com) using
// the same Entra app registration the mail agent (em-ingest) reads with.
// The registration needs the APPLICATION permission Mail.Send, scoped to
// that one mailbox with an Exchange ApplicationAccessPolicy so the app can't
// send as anyone else.
//
// Secrets (supabase secrets set ...), shared with em-ingest:
//   EM_GRAPH_TENANT_ID, EM_GRAPH_CLIENT_ID, EM_GRAPH_CLIENT_SECRET
//   EM_MAILBOX         sending mailbox (or MAIL_FROM to override)

// deno-lint-ignore-file no-explicit-any
let cached: { token: string; exp: number } | null = null;

export function mailConfigured(): boolean {
  return !!(Deno.env.get("EM_GRAPH_TENANT_ID") && Deno.env.get("EM_GRAPH_CLIENT_ID")
    && Deno.env.get("EM_GRAPH_CLIENT_SECRET") && senderAddress());
}

export const senderAddress = () => Deno.env.get("MAIL_FROM") || Deno.env.get("EM_MAILBOX") || "";

async function graphToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const tenant = Deno.env.get("EM_GRAPH_TENANT_ID")!;
  const body = new URLSearchParams({
    client_id: Deno.env.get("EM_GRAPH_CLIENT_ID")!,
    client_secret: Deno.env.get("EM_GRAPH_CLIENT_SECRET")!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Graph token: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3000) * 1000 };
  return cached.token;
}

export async function sendMail(opts: {
  to: string; subject: string; html: string; replyTo?: string; headers?: Record<string, string>;
}): Promise<void> {
  const from = senderAddress();
  const message: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.html },
    toRecipients: [{ emailAddress: { address: opts.to } }],
  };
  if (opts.replyTo) message.replyTo = [{ emailAddress: { address: opts.replyTo } }];
  if (opts.headers) message.internetMessageHeaders = Object.entries(opts.headers).map(([name, value]) => ({ name, value }));
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" },
    // Not saved to Sent Items: the sender is the mail agent's capture mailbox,
    // and automated reports shouldn't pile up there.
    body: JSON.stringify({ message, saveToSentItems: false }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Graph sendMail ${r.status}: ${t.slice(0, 300)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────────────────────────────────────
// Five business templates that cover the most common outbound CRM mail:
//   quote            — send a fresh quotation to the customer
//   follow-up        — generic nudge after no response
//   welcome          — first-touch after lead → customer conversion
//   renewal-reminder — heads-up that a contract is approaching renewal
//   ar-dunning       — overdue invoice reminder (escalating tone variants
//                      can be added later — this PR ships the first one)
//
// Variables are simple {{path.to.value}} placeholders, resolved client-side
// by `interpolate()` in src/utils/email.js. We deliberately keep this as
// plain JS (not a dependency on a templating library) so non-engineers can
// safely edit copy without breaking compilation.
//
// To add a new template:
//   1. Append an entry below with a unique `id`
//   2. List its required variables in `vars` (used to validate before send)
//   3. Subject + html may reference any var via {{path.to.value}}
//
// HTML is intentionally minimal: inline styles only, table-based layout
// for compatibility with Outlook / Gmail / Apple Mail. Avoid <style>
// blocks (Gmail strips them in some contexts) and avoid web fonts.
// ─────────────────────────────────────────────────────────────────────────────

// Shared HTML scaffold so all templates have the same brand frame.
// `bodyHtml` is the inner content; everything else (header strip, signature,
// footer with company info) is consistent across templates.
const wrap = (bodyHtml) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#F2F5F8;font-family:Arial,Helvetica,sans-serif;color:#0D1F2D;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F8;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(13,31,45,0.08);">
        <tr><td style="background:#1B6B5A;padding:18px 28px;color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:0.3px;">
          {{org.name}}
        </td></tr>
        <tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#0D1F2D;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#F8FAFB;padding:16px 28px;font-size:11px;color:#8BA3B4;border-top:1px solid #E2E9EF;">
          {{owner.name}} · {{owner.email}}<br/>
          {{org.name}} · This is a transactional email from your CRM. Reply directly to reach {{owner.firstName}}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

export const EMAIL_TEMPLATES = [
  {
    id: "quote",
    name: "Send Quotation",
    description: "Email a quote to the customer with the accept link.",
    appliesTo: ["quote"], // surfaces the template when entity context is a quote
    vars: ["contact.firstName", "owner.firstName", "quote.id", "quote.title", "quote.total", "quote.expiryDate", "quote.acceptUrl"],
    subject: "Your quotation {{quote.id}} from {{org.name}}",
    body: wrap(`
      <p>Hi {{contact.firstName}},</p>
      <p>Please find your quotation attached for review:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;border:1px solid #E2E9EF;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:14px 18px;background:#F8FAFB;">
          <div style="font-size:11px;color:#8BA3B4;text-transform:uppercase;letter-spacing:0.5px;">Quotation</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px;">{{quote.title}} · {{quote.id}}</div>
        </td></tr>
        <tr><td style="padding:14px 18px;border-top:1px solid #E2E9EF;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:13px;color:#4A6070;">Total value</td><td style="font-size:14px;font-weight:700;text-align:right;">{{quote.total}}</td></tr>
            <tr><td style="font-size:13px;color:#4A6070;padding-top:6px;">Valid until</td><td style="font-size:13px;text-align:right;padding-top:6px;">{{quote.expiryDate}}</td></tr>
          </table>
        </td></tr>
      </table>
      <p style="margin:18px 0;text-align:center;">
        <a href="{{quote.acceptUrl}}" style="display:inline-block;background:#1B6B5A;color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View &amp; Accept Online</a>
      </p>
      <p>Happy to walk through any line items or pricing context — just reply to this email and I'll get back to you.</p>
      <p>Best,<br/>{{owner.firstName}}</p>
    `),
  },

  {
    id: "follow-up",
    name: "Follow-up nudge",
    description: "Generic check-in after no response. Use after 3–7 days of silence.",
    appliesTo: ["lead", "opp", "quote", "contact"],
    vars: ["contact.firstName", "owner.firstName", "lastSubject"],
    subject: "Quick follow-up — {{lastSubject}}",
    body: wrap(`
      <p>Hi {{contact.firstName}},</p>
      <p>Just circling back on my last note about <strong>{{lastSubject}}</strong> — wanted to make sure it didn't slip through the cracks.</p>
      <p>A few ways I can help right now:</p>
      <ul style="padding-left:20px;margin:12px 0;">
        <li>Walk through a tailored demo of the modules you'd actually use</li>
        <li>Share a deployment timeline / pricing for your specific scope</li>
        <li>Connect you with a customer in a similar setup as a reference</li>
      </ul>
      <p>What's the best time for a 15-minute call this week?</p>
      <p>Best,<br/>{{owner.firstName}}</p>
    `),
  },

  {
    id: "welcome",
    name: "Welcome new customer",
    description: "First-touch after a lead converts to a customer / contract is signed.",
    appliesTo: ["account", "contact", "contract"],
    vars: ["contact.firstName", "owner.firstName", "account.name"],
    subject: "Welcome to {{org.name}}, {{contact.firstName}} 👋",
    body: wrap(`
      <p>Hi {{contact.firstName}},</p>
      <p>Welcome aboard — we're thrilled to have <strong>{{account.name}}</strong> as a customer.</p>
      <p>Here's what happens next:</p>
      <ol style="padding-left:20px;margin:12px 0;">
        <li><strong>Kick-off call</strong> — I'll reach out in the next 24h to schedule a 30-minute alignment with your team and our implementation lead.</li>
        <li><strong>Onboarding plan</strong> — we'll share a per-week timeline with milestones, owners, and a single point of contact at our end.</li>
        <li><strong>Training</strong> — every named user gets access to weekly live training sessions plus on-demand walkthroughs.</li>
      </ol>
      <p>You can reach me directly any time — I'm your primary point of contact at {{org.name}}.</p>
      <p>Welcome again,<br/>{{owner.firstName}}</p>
    `),
  },

  {
    id: "renewal-reminder",
    name: "Renewal reminder",
    description: "Heads-up about an upcoming contract renewal. Use 60–90 days before renewal date.",
    appliesTo: ["contract"],
    vars: ["contact.firstName", "owner.firstName", "contract.id", "contract.renewalDate", "daysToRenewal"],
    subject: "Heads-up: contract {{contract.id}} renews in {{daysToRenewal}} days",
    body: wrap(`
      <p>Hi {{contact.firstName}},</p>
      <p>A friendly heads-up that your contract <strong>{{contract.id}}</strong> is approaching renewal on <strong>{{contract.renewalDate}}</strong> — that's {{daysToRenewal}} days away.</p>
      <p>I'd love to schedule a renewal-and-roadmap conversation to:</p>
      <ul style="padding-left:20px;margin:12px 0;">
        <li>Review usage and value delivered over the current term</li>
        <li>Walk through new modules / capabilities you might benefit from</li>
        <li>Discuss any commercial adjustments and lock in renewal terms with no last-minute scramble</li>
      </ul>
      <p>What's a good slot for a 30-minute call in the next two weeks?</p>
      <p>Best,<br/>{{owner.firstName}}</p>
    `),
  },

  {
    id: "ar-dunning",
    name: "AR / overdue invoice reminder",
    description: "Polite first reminder for an overdue invoice. Escalates to collections only after this fails.",
    appliesTo: ["invoice", "collection", "account"],
    vars: ["contact.firstName", "owner.firstName", "invoice.id", "invoice.amount", "invoice.dueDate", "invoice.daysOverdue"],
    subject: "Reminder: invoice {{invoice.id}} ({{invoice.amount}}) is now {{invoice.daysOverdue}} days overdue",
    body: wrap(`
      <p>Hi {{contact.firstName}},</p>
      <p>I'm following up on invoice <strong>{{invoice.id}}</strong> for <strong>{{invoice.amount}}</strong>, which was due on {{invoice.dueDate}} and is now {{invoice.daysOverdue}} days past due.</p>
      <p>If the payment is already in flight, please ignore this note and share a UTR / cheque reference at your convenience so we can clear it on our side.</p>
      <p>If there's a query holding it up — billing detail, PO mismatch, or anything else — happy to get on a call and resolve it the same day.</p>
      <p>You can reach me on this email or directly at the number below.</p>
      <p>Thanks,<br/>{{owner.firstName}}</p>
    `),
  },
];

// Quick lookup by id for the SendEmailModal.
export const TEMPLATES_BY_ID = Object.fromEntries(EMAIL_TEMPLATES.map(t => [t.id, t]));

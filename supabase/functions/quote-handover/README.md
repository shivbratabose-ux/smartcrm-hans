# quote-handover — e-mails of the Quote → Accounts flow

| Action | When | To |
|---|---|---|
| `notify-final` | Sales marks a quote FINAL | every Accounts person (Masters → Quotation Pricing → Config → Accounts team; default: Finance role) |
| `send-bill` | Accounts clicks **Send to customer** | the quote's billing contact e-mail (else finance contact, else the quote contact) |

Until mail is set up, the function returns `{ notConfigured: true }`. The CRM keeps working: Accounts gets the bell alert and task, and **Copy link** gives the customer's confirm link to share by hand.

## Switching e-mail on (Microsoft 365, one-time, by IT)

The same app registration the mail agent uses (shared with `activity-digest` and `lead-intake`):

1. **Entra ID → App registrations → New** (e.g. "SmartCRM mail"). Note the *Tenant ID* and *Client ID*.
2. **API permissions → Microsoft Graph → Application → `Mail.Send`** → *Grant admin consent*.
3. **Certificates & secrets → New client secret**. Copy the value.
4. Restrict the app to the one sending mailbox (Exchange Online PowerShell):
   ```powershell
   New-ApplicationAccessPolicy -AppId <CLIENT_ID> -PolicyScopeGroupId communication@hansinfomatic.com -AccessRight RestrictAccess -Description "SmartCRM sends only as communication@"
   ```
5. Give the values to the CRM admin, who sets them (never commit them):
   ```bash
   supabase secrets set EM_GRAPH_TENANT_ID=… EM_GRAPH_CLIENT_ID=… EM_GRAPH_CLIENT_SECRET=… EM_MAILBOX=communication@hansinfomatic.com
   ```

E-mails start with the next FINAL quote / **Send to customer**. Nothing to redeploy.

Deploy: `supabase functions deploy quote-handover`

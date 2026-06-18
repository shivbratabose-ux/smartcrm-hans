# SmartCRM — Hans Infomatic Pvt. Ltd.

Internal CRM for aviation/logistics software business development.

## Stack
- React 18 + Vite 5
- Recharts
- Google Fonts: Outfit + DM Sans

## Local Development

```bash
npm install
npm run dev
# Opens at http://localhost:5173
# Local network access: http://<your-ip>:5173
```

## Build for Production

```bash
npm run build
npm run preview   # test the production build locally
```

## Deploy Options

### Option A — Vercel (recommended)
1. Push repo to GitHub
2. Go to vercel.com → New Project → Import repo
3. Framework: Vite (auto-detected)
4. Click Deploy
5. Auto-deploys on every `git push`

### Option B — Render
1. Push repo to GitHub
2. Go to render.com → New Static Site
3. Connect repo, build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Auto-deploys on every `git push`

### Option C — GitHub Pages
```bash
npm install --save-dev gh-pages
# Add to package.json scripts: "deploy": "gh-pages -d dist"
npm run build && npm run deploy
```

## File Structure

```
smartcrm-hans/
├── index.html
├── vite.config.js
├── package.json
├── vercel.json          # Vercel SPA routing
├── render.yaml          # Render deploy config
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx         # React entry point
    └── SmartCRM.jsx     # Full application (copy from delivery)
```

## Adding SmartCRM.jsx
Copy the delivered SmartCRM.jsx into the `src/` folder.

## Quotation Module (CRM-driven, Hans pricing)

A CRM-driven quotation capability ported from the validated Excel model
(`Hans_Quotation_Module_3.xlsx`). It extends the existing Quotations
module rather than replacing it.

### Flow
Quotations → **New (Hans pricing)** → pick an Opportunity (party
auto-resolves from the linked account or lead) → add catalogue lines
(Qty / Months / Disc%) → the engine computes the one-time vs recurring
split, overall + prepayment discounts, GST (intra-/inter-state),
Licence + ALR (shown separately), Grand Total and TCV live. Guardrails
surface inline. **Save** assigns a number (`SQ/M######/YY-YY`) and adds
it to the Quote Register; **Preview / Print** produces a client-facing
PDF (party block, line items, GST split, ALR separate, terms).

### Architecture
| File | Role |
|------|------|
| `src/lib/quotation/pricingEngine.js` | **Pure** engine — rate resolution (Flat/Band/iCAFFE matrix), line + quote formulas, GST split, guardrails, quote numbering. No UI/state coupling. |
| `src/data/quotationMasters.js` | Seed masters (catalogue, pricing bands, iCAFFE rate card, config, terms) — defaults only; all editable. |
| `src/components/HansQuoteBuilder.jsx` | Opportunity-first builder + live summary + guardrail banners. |
| `src/components/QuotationMasters.jsx` | Admin editor (Masters → **Quotation Pricing** tab). |
| `src/lib/quotation/printQuote.js` | Client-facing print/PDF. |
| `scripts/test-pricing-engine.mjs` | Headless acceptance tests (`npm run test:pricing`). |

### Formula basis (workbook-faithful)
- **TCV** = Grand Total incl GST.
- **Prepayment discount** = % of (subtotal − overall discount).
- An **overall-discount** line feeds the taxable base.
- **One-time** lines (One-time Licence / Implementation) force Months = 1.
- **Floor** models (PaaS Per-Flight / Per-Transaction) bill the greater
  of (qty × rate) or the per-month minimum.
- **ALR** = Config ALR% × one-time-licence base, shown separately and
  **excluded** from the upfront Grand Total.

### Editing rates / masters
**Masters → Quotation Pricing** (admin only). Sub-tabs:
- **Config** — home state, GST%, max discount%, ALR%, default prepayment%, FX.
- **Catalogue rates** — list price (Flat products) and per-month floor.
- **Pricing Bands** — per-user/month rate by user-count band.
- **iCAFFE Rate Card** — the edition × user-band matrix.
- **Terms** — reusable T&Cs.

Changes persist via the existing settings store (`saveSettings`, under
`masters.quotation`) — use Masters' **Push to Cloud** to sync. No rates
are hard-coded in code; seed values are defaults. The **CC03 > CC04**
rule is enforced inline (blocks an invalid rate card).

### Guardrails
- Discount over `maxUserDiscountPct` (line or overall) → quote saved with
  `approvalStatus: "Pending"` (status stays a normal `Draft`, so it remains
  visible under the register's status filters/KPIs and flows through the
  existing approval queue).
- **CC03 > CC04** validated in admin and warned on quotes using both.
- **WiseHandling** requires ≥ 3 functional modules (warned otherwise).
- A priced line resolving to a blank rate is flagged "Enter rate in
  master" rather than silently producing 0.

### Permissions
- **Sales** — create quotes; over-policy discounts route to approval.
- **Manager/Approver** — approve (existing approval flow).
- **Admin** — edit the Quotation Pricing masters.

### Database migrations
Run these (in `supabase/`) so the related data persists to the cloud.
Writes are guarded by the app's schema-heal, so the app won't break if a
migration is pending — the affected columns are simply not persisted until
it's applied.
- `add_account_lineage_v1.sql` — lead → opp → account ID lineage on `accounts`.
- `add_lead_duplicate_flag_v1.sql` — `duplicate_of` on `leads` (duplicate flag).
- `add_quotation_hans_breakdown_v1.sql` — `hans` JSONB on `quotations` (engine breakdown).

### Pricing engine tests
`npm run test:pricing` runs the headless §11 acceptance vectors against
`src/lib/quotation/pricingEngine.js`.

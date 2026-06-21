# Quotation Masters — "Intelligent & Dynamic" Roadmap

How the quotation pricing masters evolve from static lookup tables into a
dynamic, self-validating pricing system. Sequenced by value vs. risk.

Masters today (Masters → Quotation Pricing): **Config · Catalogue rates ·
Pricing Bands · iCAFFE Rate Card · Terms**, stored under
`masters.quotation` (persisted via `saveSettings`), consumed by the pure
`src/lib/quotation/pricingEngine.js`.

---

## ✅ Phase 1 — Coverage intelligence (shipped, PR #171)
Surface rate gaps centrally instead of only at quote time.
- Pricing-coverage strip (Catalogue / Bands / iCAFFE / CC03>CC04) — green
  when complete, amber with counts when gaps remain; chips jump to the tab.
- Catalogue **Status** column (Priced / Rate missing / Inclusive / From
  bands / Needs bands / Rate-card gaps) + red-tinted missing price cells.

---

## Phase 2 — Dynamic pricing (the core upgrade) · *preview-first*
A rate today is a single number, the same forever and everywhere. Make it
time-, segment- and currency-aware.

**2a. Effective-dated rates + history.** Add `validFrom` / `validTo` (and a
version trail) per rate. The engine selects the rate effective on the quote
date; renewals can show old→new. Foundation for scheduled price changes and
for applying the **GRI / ARR escalation** that's already defined in the
iCAFFE plan params but not yet used.
- Touches: rate shape in masters, `resolveUnitPrice` (pass quote date),
  editor (date columns + "history" drawer). Migration: none (lives in
  `app_settings` JSONB).

**2b. Segment price lists.** Government/PSU vs Commercial vs SME pricing.
Pick the price column from the opportunity's segment (a Government T&C
template already exists — pricing should follow).

**2c. Currency price lists.** Today it's only an FX divisor. Add explicit
USD/EUR list prices for real export quotes rather than a converted INR.

> Suggested order within Phase 2: **2a → 2b → 2c**. Each is independently
> shippable behind the existing builder.

---

## Phase 3 — Guardrails that think · *protect revenue*
**3a. Margin / cost floor.** Store a cost (or floor price) per product; the
engine flags/blocks any line below minimum margin — not just discounts over
a flat %.

**3b. Tiered discount authority.** Replace the single global
`maxUserDiscountPct` with role × product × deal-size bands (rep ≤10%,
manager ≤20%, …). Drives who must approve.

**3c. Auto volume / term discounts.** Data-driven "≥250 users → 8%",
"42-mo term → 15%" instead of the rep typing the number.

---

## Phase 4 — Scale without deploys
**4a. Rules as data.** The **CC03 > CC04** and **WiseHandling ≥ 3 modules**
rules are hardcoded in the engine. Move them to an editable rules master
(`{type, scope, condition, severity, message}`) so finance can add product
rules (bundles, dependencies, "AMC requires a licence line") without code.

**4b. CSV / XLSX import-export** of the catalogue + rate card (we already
parse xlsx) — bulk-update many rates at once; round-trip with the Excel
model.

**4c. Audit trail** on rate edits (who / when / old→new). Pricing changes
are sensitive.

**4d. Editable plan presets.** SaaS Monthly / Advance / OTP+ARR live in
code (`ICAFFE_PLANS`); move them into masters so new plans don't need a
deploy.

**4e. "Seed missing only"** option alongside "Reset to defaults" so a reset
fills blanks without wiping entered rates.

---

## Notes
- All masters persist in `app_settings` JSONB — most of the above needs **no
  SQL migration** (unlike the lead/opp/account work).
- Pricing-engine changes are covered by `npm run test:pricing`
  (`scripts/test-pricing-engine.mjs`); extend the §11 vectors as behavior
  changes.
- Phase 2+ are behavior-changing on a live, in-use module — build on a
  branch with a **preview deploy** and verify before merging.

# `ai-claude` edge function

Server-side proxy to the Claude (Anthropic) API for SmartCRM's optional AI
assistant (Phase 8). The Anthropic API key lives **only** here as a server
secret — it is never shipped to the browser and never stored in the database.

## What it does

`POST` with a Supabase JWT (`Authorization: Bearer <token>`). Two actions:

### `{ "action": "status" }`
Returns config health for the AI Settings panel — **without exposing the key**:
```json
{ "ok": true, "keyConfigured": true, "enabled": false, "model": "claude-opus-4-8", "features": { ... } }
```

### `{ "action": "run", "feature": "...", "payload": {...}, "pdfBase64": "...", "model": "..." }`
Runs one AI feature and returns a structured result:
```json
{ "ok": true, "feature": "tenderQualification", "model": "...", "result": { ... }, "usage": { ... } }
```

Supported `feature` values:

| feature | input (`payload`) | output (`result`) |
|---|---|---|
| `tenderQualification` | tender fields JSON | fit score + dimensions, strengths, risks, missing info |
| `bidRecommendation` | tender + qualification JSON | Bid / Conditional / No-Bid + rationale, conditions, risks, next steps |
| `callSummary` | `{ note, meta }` | summary, key points, decisions, action items, sentiment, next steps |
| `complianceMatrix` | `pdfBase64` (RFP PDF) **or** `payload` text | requirement→compliance matrix + totals |

`model` (optional) overrides the org default; only `claude-opus-4-8`,
`claude-sonnet-4-6`, `claude-haiku-4-5` are accepted.

## Guardrails baked in

- **Auth** — caller must be an active CRM user (same check as `send-email`).
- **Off by default** — refuses to run unless `app_settings.ai_config.enabled`
  is `true` (set via the AI Settings panel) **and** the per-feature flag is on.
  This is enforced *server-side*, not just in the UI.
- **Human-in-the-loop** — every feature returns suggestions only. Nothing is
  written to the CRM or sent anywhere; the client decides what to keep.
- **Prompt caching** — the static company/scoring context is marked
  `cache_control: ephemeral`, so repeated calls reuse the cached prefix.
  Per-record data goes in the user turn so it doesn't invalidate the cache.

## Deploy

```bash
# 1. Apply the migration that adds the ai_config column (run once):
#    supabase/add_ai_config_v1.sql

# 2. Set the API key as a server secret (NEVER commit this):
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 3. Deploy the function:
supabase functions deploy ai-claude
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by Supabase.

## Cost notes

- Default model is **Opus 4.8** (most capable). For high-volume, cost-sensitive
  use, an admin can switch the org to **Haiku 4.5** in AI Settings.
- Prompt caching makes the large static context ~10× cheaper on repeat calls.
- `complianceMatrix` can be token-heavy on big RFPs (long output); it streams
  server-side to avoid timeouts.

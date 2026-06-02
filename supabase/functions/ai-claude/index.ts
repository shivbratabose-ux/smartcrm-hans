// Edge Function: ai-claude
// -----------------------------------------------------------------------------
// Server-side proxy to the Claude (Anthropic) API for SmartCRM's optional AI
// assistant features (Phase 8). The Anthropic API key lives ONLY here as a
// server secret — it is never sent to or stored anywhere the browser can read.
//
// Features (all human-in-the-loop — AI produces SUGGESTIONS, never auto-acts):
//   tenderQualification — score a tender's fit + strengths/risks/missing info
//   bidRecommendation   — Bid / No-Bid / Conditional, with rationale
//   callSummary         — summarise a meeting/call note into structured output
//   complianceMatrix    — extract a requirement→compliance matrix from an RFP
//                         (accepts a PDF as base64, or pasted text)
//
// Why an edge function (same pattern as send-email)?
//   - The Anthropic key is a secret. Putting it in the React bundle or in the
//     company-wide-readable app_settings table would leak it to every user.
//     The browser calls THIS function with its Supabase JWT; the function
//     holds the key and talks to Anthropic.
//   - Prompt logic + the static company/scoring context live here so they can
//     be prompt-cached (stable byte prefix) across requests.
//
// Auth model (identical to send-email):
//   - Caller sends their Supabase JWT as Authorization: Bearer <token>.
//   - We verify it and confirm they're an active CRM user.
//
// Server-side enable gate (defence in depth):
//   - Even though the client hides AI buttons when disabled, this function
//     ALSO reads app_settings.ai_config and refuses unless `enabled` is true
//     AND the requested feature's flag is true. The toggle is off by default.
//
// Required server secret:
//   ANTHROPIC_API_KEY   — Anthropic key (sk-ant-...). Set via:
//                         supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Auto-injected by Supabase:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deployment:
//   supabase functions deploy ai-claude
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// Resolved to the latest published SDK (no hard version pin) so structured
// outputs (output_config.format), adaptive thinking, and prompt caching are
// all available. The JS SDK forwards the request body to /v1/messages, so
// newer request fields are sent through regardless of typed surface.
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";

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

// Models we permit the admin to choose in AI Settings. Restricting the set
// keeps cost predictable and prevents an arbitrary/typo'd model string from
// reaching Anthropic. Default is Opus 4.8 (most capable). Admins can pick
// Haiku for cheap, high-volume tasks. All three support structured outputs.
const ALLOWED_MODELS = new Set([
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);
const DEFAULT_MODEL = "claude-opus-4-8";

const FEATURE_FLAG: Record<string, string> = {
  tenderQualification: "tenderQualification",
  bidRecommendation: "bidRecommendation",
  callSummary: "callSummary",
  complianceMatrix: "complianceMatrix",
};

// ── Static, cacheable company context ──────────────────────────────
// This block is byte-stable across requests, so we mark it with
// cache_control so Anthropic caches the prefix (tools → system → messages).
// Per-record data is passed in the USER turn (uncached) so it doesn't
// invalidate this cache. Keep this text frozen; editing it re-writes the
// cache on the next request (cheap, one-time).
const COMPANY_CONTEXT = `You are the AI bid & delivery assistant embedded in SmartCRM, the internal CRM of Hans Infomatic Pvt. Ltd. (India).

About Hans Infomatic:
- Software product company serving enterprise and government/PSU customers in India.
- Flagship products: iCAFFE (logistics/freight), WiseCargo, WiseHandling, WiseCCS, WiseDox, WiseAMS, E-ANNEX and related logistics & document-management platforms.
- Sells via direct enterprise sales and competitive government tenders (e-procurement portals such as GeM, CPPP, state portals).
- Revenue models: licence + AMC, SaaS subscription, implementation/professional services.

Operating context for tenders:
- Government tenders involve EMD (Earnest Money Deposit), PBG (Performance Bank Guarantee), pre-bid meetings, technical + financial bid stages, strict eligibility (turnover, past performance, OEM authorisation, certifications like ISO/CMMI), and mandatory compliance clauses.
- Values in this CRM are stored in Indian Rupees Lakhs (₹L) unless stated otherwise.

Your role:
- You produce decision-support SUGGESTIONS for the sales/bid team. You never make the final decision and never take any action.
- Be concise, specific, and grounded ONLY in the data provided. If information needed for a confident judgement is missing, say so explicitly rather than inventing it.
- Indian government-procurement norms apply; flag obvious eligibility or compliance gaps.`;

// Per-feature instruction blocks (also static per feature → cacheable).
const FEATURE_SYSTEM: Record<string, string> = {
  tenderQualification: `${COMPANY_CONTEXT}

TASK: Score how well this tender fits Hans Infomatic and surface what the team must verify before investing effort.
Evaluate across these dimensions, each scored 0-100: Product/Solution Fit, Eligibility Likelihood, Commercial Attractiveness, Competitive Position, Delivery Feasibility.
fitScore is your overall weighted 0-100 assessment. recommendation is one of "Strong Fit", "Possible Fit", "Weak Fit", "Likely Disqualified".
List concrete strengths, concrete risks, and any missingInfo the team should obtain. Keep each bullet under ~25 words.`,

  bidRecommendation: `${COMPANY_CONTEXT}

TASK: Give a Bid / No-Bid recommendation for this tender, as decision support for the bid committee.
decision is one of "Bid", "Conditional Bid", "No-Bid". confidence is 0-100.
Weigh: solution fit, eligibility, EMD/PBG exposure vs deal value, competition, delivery capacity, and strategic value. If "Conditional Bid", list the conditions that must be met. Always include the main risks and concrete suggestedNextSteps. Keep bullets under ~25 words.`,

  callSummary: `${COMPANY_CONTEXT}

TASK: Summarise the following sales meeting / call note into a clean, structured brief for the CRM. Capture only what is in the note — do not invent commitments. Extract decisions, action items (with an owner if named and a due date if stated), overall customer sentiment, and next steps. Keep it crisp.`,

  complianceMatrix: `${COMPANY_CONTEXT}

TASK: From the supplied RFP / tender document, extract a compliance matrix: the list of requirements the bidder must respond to. For each requirement capture its clause/section reference (if present), the requirement text (concise), a category (e.g. Technical, Functional, Eligibility, Commercial, Legal, SLA, Documentation), whether it is mandatory, and an initial complianceStatus assessment for Hans Infomatic given the company context — one of "Compliant", "Partial", "Non-Compliant", "Needs Review" (use "Needs Review" when you cannot tell from the document alone). Add a short ourResponse suggestion and note any gap. Be thorough but do not fabricate clauses that are not in the document.`,
};

// JSON schemas constrain the model output so the client can render reliably.
// (Strict JSON-schema structured outputs; no min/max constraints — those are
// validated client-side if needed.)
const SCHEMAS: Record<string, any> = {
  tenderQualification: {
    type: "object",
    additionalProperties: false,
    properties: {
      fitScore: { type: "integer" },
      recommendation: { type: "string", enum: ["Strong Fit", "Possible Fit", "Weak Fit", "Likely Disqualified"] },
      summary: { type: "string" },
      dimensions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            score: { type: "integer" },
            rationale: { type: "string" },
          },
          required: ["name", "score", "rationale"],
        },
      },
      strengths: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      missingInfo: { type: "array", items: { type: "string" } },
    },
    required: ["fitScore", "recommendation", "summary", "dimensions", "strengths", "risks", "missingInfo"],
  },
  bidRecommendation: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: { type: "string", enum: ["Bid", "Conditional Bid", "No-Bid"] },
      confidence: { type: "integer" },
      rationale: { type: "string" },
      keyFactors: { type: "array", items: { type: "string" } },
      conditions: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      suggestedNextSteps: { type: "array", items: { type: "string" } },
    },
    required: ["decision", "confidence", "rationale", "keyFactors", "conditions", "risks", "suggestedNextSteps"],
  },
  callSummary: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      keyPoints: { type: "array", items: { type: "string" } },
      decisions: { type: "array", items: { type: "string" } },
      actionItems: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            task: { type: "string" },
            owner: { type: "string" },
            due: { type: "string" },
          },
          required: ["task"],
        },
      },
      sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative", "Mixed"] },
      nextSteps: { type: "array", items: { type: "string" } },
      suggestedFollowUpDate: { type: "string" },
    },
    required: ["summary", "keyPoints", "decisions", "actionItems", "sentiment", "nextSteps"],
  },
  complianceMatrix: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      totals: {
        type: "object",
        additionalProperties: false,
        properties: {
          total: { type: "integer" },
          mandatory: { type: "integer" },
          compliant: { type: "integer" },
          partial: { type: "integer" },
          nonCompliant: { type: "integer" },
          needsReview: { type: "integer" },
        },
        required: ["total", "mandatory", "compliant", "partial", "nonCompliant", "needsReview"],
      },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            refClause: { type: "string" },
            requirement: { type: "string" },
            category: { type: "string" },
            mandatory: { type: "boolean" },
            complianceStatus: { type: "string", enum: ["Compliant", "Partial", "Non-Compliant", "Needs Review"] },
            ourResponse: { type: "string" },
            gap: { type: "string" },
          },
          required: ["requirement", "category", "mandatory", "complianceStatus"],
        },
      },
    },
    required: ["summary", "totals", "items"],
  },
};

// Per-feature tuning. Reasoning tasks get adaptive thinking; extraction/
// summary tasks run leaner. max_tokens sized to each output shape.
const FEATURE_TUNING: Record<string, { maxTokens: number; thinking: boolean; effort: string }> = {
  tenderQualification: { maxTokens: 4000, thinking: true, effort: "high" },
  bidRecommendation: { maxTokens: 4000, thinking: true, effort: "high" },
  callSummary: { maxTokens: 3000, thinking: false, effort: "low" },
  complianceMatrix: { maxTokens: 32000, thinking: true, effort: "high" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    // 1. Verify the caller is an active CRM user (same as send-email).
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Missing Authorization bearer token" }, 401);

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userInfo, error: uerr } = await asCaller.auth.getUser();
    if (uerr || !userInfo?.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: cperr } = await admin
      .from("users")
      .select("id, name, role, active")
      .eq("auth_user_id", userInfo.user.id)
      .single();
    if (cperr || !callerProfile) return json({ error: "Caller has no CRM profile" }, 403);
    if (!callerProfile.active) return json({ error: "Caller is deactivated" }, 403);

    // Load the org AI config once (used by both status + run).
    const { data: settingsRow } = await admin
      .from("app_settings")
      .select("ai_config")
      .eq("scope", "org")
      .maybeSingle();
    const aiConfig = (settingsRow?.ai_config || {}) as any;
    const aiEnabled = aiConfig?.enabled === true;
    const configuredModel = ALLOWED_MODELS.has(aiConfig?.model) ? aiConfig.model : DEFAULT_MODEL;

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "run";

    // ── status: lets the AI Settings panel report config health without
    //    ever exposing the key. Returns whether the key secret is present
    //    and what model/enable state the org has.
    if (action === "status") {
      return json({
        ok: true,
        keyConfigured: !!ANTHROPIC_API_KEY,
        enabled: aiEnabled,
        model: configuredModel,
        features: aiConfig?.features || {},
      });
    }

    // ── run: actually call Claude for a feature.
    if (action !== "run") return json({ error: `Unknown action: ${action}` }, 400);

    if (!ANTHROPIC_API_KEY) {
      return json({ error: "AI is not configured: ANTHROPIC_API_KEY secret is not set on the server.", keyConfigured: false }, 503);
    }
    if (!aiEnabled) {
      return json({ error: "AI features are turned off. An administrator can enable them in AI Settings." }, 403);
    }

    const feature: string = body.feature;
    if (!feature || !FEATURE_SYSTEM[feature]) {
      return json({ error: `Unknown or missing feature: ${feature}` }, 400);
    }
    // Server-side per-feature gate (defence in depth).
    const flagKey = FEATURE_FLAG[feature];
    const featureEnabled = aiConfig?.features?.[flagKey] !== false; // default-on once master switch is on
    if (!featureEnabled) {
      return json({ error: `The "${feature}" AI feature is disabled by an administrator.` }, 403);
    }

    const model = ALLOWED_MODELS.has(body.model)
      ? body.model
      : configuredModel;
    const tuning = FEATURE_TUNING[feature];

    // Build the dynamic user content. complianceMatrix may carry a PDF.
    const userBlocks: any[] = [];
    if (feature === "complianceMatrix" && body.pdfBase64) {
      userBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: body.pdfBase64 },
      });
    }
    // `payload` is the structured record data (tender fields, note text, etc.)
    // serialized by the client. We hand it to the model as labelled JSON.
    const payloadText = typeof body.payload === "string"
      ? body.payload
      : JSON.stringify(body.payload ?? {}, null, 2);
    userBlocks.push({
      type: "text",
      text: feature === "complianceMatrix"
        ? `Extract the compliance matrix from the document above.${body.pdfBase64 ? "" : "\n\nDocument text:\n" + payloadText}`
        : `Here is the data to analyse (JSON):\n\n${payloadText}`,
    });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // System prompt is static per feature → cache it (prefix match).
    const system = [
      { type: "text", text: FEATURE_SYSTEM[feature], cache_control: { type: "ephemeral" } },
    ];

    const requestParams: any = {
      model,
      max_tokens: tuning.maxTokens,
      system,
      messages: [{ role: "user", content: userBlocks }],
      output_config: {
        effort: tuning.effort,
        format: { type: "json_schema", schema: SCHEMAS[feature] },
      },
    };
    if (tuning.thinking) requestParams.thinking = { type: "adaptive" };
    else requestParams.thinking = { type: "disabled" };

    // Stream + finalMessage so large outputs (compliance matrix) don't hit
    // the SDK's non-streaming HTTP timeout.
    const stream = anthropic.messages.stream(requestParams);
    const message = await stream.finalMessage();

    const textBlock = (message.content || []).find((b: any) => b.type === "text");
    const raw = textBlock?.text || "";
    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      // Structured output should always be valid JSON; if not (e.g. refusal /
      // max_tokens truncation), surface the raw text so the client can show it.
      return json({
        ok: false,
        error: message.stop_reason === "max_tokens"
          ? "The response was too long and got cut off. Try a smaller document or fewer requirements."
          : "The AI response could not be parsed.",
        raw,
        stopReason: message.stop_reason,
      }, 502);
    }

    return json({
      ok: true,
      feature,
      model,
      result,
      usage: {
        input: message.usage?.input_tokens ?? null,
        output: message.usage?.output_tokens ?? null,
        cacheRead: (message.usage as any)?.cache_read_input_tokens ?? null,
        cacheWrite: (message.usage as any)?.cache_creation_input_tokens ?? null,
      },
      generatedAt: new Date().toISOString(),
      generatedBy: callerProfile.name || callerProfile.id,
    });
  } catch (e) {
    return json({ error: `Unexpected: ${(e as Error).message}` }, 500);
  }
});

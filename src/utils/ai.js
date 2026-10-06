// ─────────────────────────────────────────────────────────────────────────────
// AI helpers — client for the `ai-claude` Supabase edge function (Phase 8)
// ─────────────────────────────────────────────────────────────────────────────
// Single chokepoint between the browser and SmartCRM's AI assistant. Like
// utils/email.js for send-email, everything AI goes through here so we get:
//   - the user's auth header on every call
//   - one normalised result shape  { ok, result, error, usage }
//   - graceful dev fallback when Supabase isn't configured
//
// SECURITY: this file NEVER sees the Anthropic API key. The key lives only as
// a server secret consumed by the edge function. We only send the user's
// Supabase JWT + the data to analyse.
//
// HUMAN-IN-THE-LOOP: every helper returns a suggestion object for the UI to
// display. Nothing here writes to the CRM or takes any action — the calling
// component decides what (if anything) the user keeps.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Default AI config shape. OFF by default — nothing calls Claude until an
// admin flips `enabled` in AI Settings AND the server key secret is set.
export const DEFAULT_AI_CONFIG = {
  enabled: false,
  model: "claude-opus-4-8",
  features: {
    tenderQualification: true,
    bidRecommendation: true,
    callSummary: true,
    complianceMatrix: true,
    emailAnalysis: true,
    // Email-to-CRM Activity Agent (Module B) — the em-ingest pipeline's
    // model calls. Gated here so an admin can stop the agent's AI step
    // without touching the mailbox polling.
    emailToActivity: true,
    // Customer Re-engagement Agent (Module A) — the daily draft run.
    reEngageDraft: true,
    // Scan a visiting card photo into a contact (+ button → Scan visiting card).
    businessCard: true,
  },
};

export const AI_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — most capable (default)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — balanced" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest / cheapest" },
];

export const AI_FEATURES = [
  { key: "tenderQualification", label: "Tender Qualification Scoring", desc: "Score how well a tender fits Hans Infomatic, with strengths, risks & missing info." },
  { key: "bidRecommendation", label: "Bid / No-Bid Recommendation", desc: "A Bid / Conditional / No-Bid call with rationale, conditions and next steps." },
  { key: "callSummary", label: "Meeting / Call Summaries", desc: "Turn a raw call note into a structured brief: decisions, action items, sentiment." },
  { key: "complianceMatrix", label: "Compliance Matrix from RFP", desc: "Extract a requirement→compliance matrix from an uploaded RFP / tender PDF." },
  { key: "businessCard", label: "Visiting Card Scanner", desc: "Photograph a business card and turn it into a contact — checks for existing accounts, contacts and leads first. The photo is read, not stored." },
  { key: "emailAnalysis", label: "Email Analysis", desc: "Summarise a customer email/thread and extract intent, action items, commitments, shipment refs, priority & sentiment." },
];

/** Is a given feature usable right now? (config enabled + feature flag on) */
export function isAiFeatureOn(aiConfig, feature) {
  const c = aiConfig || {};
  if (!c.enabled) return false;
  // Default-on once the master switch is on, unless explicitly turned off.
  return c.features?.[feature] !== false;
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Low-level call to the edge function. Returns a normalised shape:
 *   { ok: true,  result, model, usage, generatedAt, generatedBy }
 *   { ok: false, error }
 */
async function invokeAi(payloadBody) {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase isn't configured, so AI features are unavailable in this environment." };
  }
  const token = await getToken();
  if (!token) return { ok: false, error: "Not signed in. Please log in again." };

  try {
    const { data, error } = await supabase.functions.invoke("ai-claude", {
      body: payloadBody,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      // supabase-js surfaces the server JSON body in `data` even on non-2xx.
      const serverMsg = data?.error || error.message;
      return { ok: false, error: serverMsg, raw: data?.raw };
    }
    if (!data?.ok) return { ok: false, error: data?.error || "Unknown AI error", raw: data?.raw };
    return data; // { ok:true, feature, model, result, usage, ... }
  } catch (e) {
    return { ok: false, error: e?.message || "Network error reaching the AI service." };
  }
}

/**
 * Check AI configuration health (for the AI Settings panel). Does not run any
 * model — just reports whether the server key is set + the org enable state.
 * { ok, keyConfigured, enabled, model, features }
 */
export async function getAiStatus() {
  return invokeAi({ action: "status" });
}

/** Generic feature runner. `feature` must match an edge-function feature. */
export async function runAiFeature(feature, { payload, pdfBase64, imageBase64, imageMediaType, model } = {}) {
  return invokeAi({ action: "run", feature, payload, pdfBase64, imageBase64, imageMediaType, model });
}

/** Read a visiting-card photo. Resolves { ok, result: {name, company, emails, phones, …} }. */
export function aiBusinessCard({ base64, mediaType }, model) {
  return runAiFeature("businessCard", { imageBase64: base64, imageMediaType: mediaType, model });
}

/**
 * Shrink a camera photo for upload: ≤ maxSide px on the long edge, JPEG.
 * A 12 MP phone photo (3–5 MB) becomes ~150–400 KB — plenty to read a card,
 * and fast on mobile data. Uses <img> decoding, so iOS HEIC works in Safari.
 * Resolves { base64 (no data: prefix), mediaType, previewUrl, width, height }.
 */
export function compressImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(url);
        resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg", previewUrl: dataUrl, width: w, height: h });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't an image this browser can open. Try a JPEG or PNG photo.")); };
    img.src = url;
  });
}

// ── Convenience wrappers, one per feature ──────────────────────────────────

export function aiTenderQualification(tender, model) {
  return runAiFeature("tenderQualification", { payload: tender, model });
}

export function aiBidRecommendation(input, model) {
  // input = { tender, qualification }
  return runAiFeature("bidRecommendation", { payload: input, model });
}

export function aiCallSummary(note, meta, model) {
  return runAiFeature("callSummary", { payload: { note, meta }, model });
}

export function aiComplianceMatrix({ pdfBase64, text }, model) {
  return runAiFeature("complianceMatrix", { payload: text || "", pdfBase64, model });
}

/**
 * Analyse a customer email / thread. `email` = { text, subject, from, to,
 * context } — the raw email plus optional linked-record hints. Returns the
 * structured extraction (summary, intent, actionItems, shipmentRefs, …).
 */
export function aiEmailAnalysis(email, model) {
  return runAiFeature("emailAnalysis", { payload: email, model });
}

/**
 * Read a File (RFP PDF) into a base64 string (no data: prefix) for the
 * complianceMatrix feature. Resolves { base64, name, sizeMB }.
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const base64 = res.includes(",") ? res.split(",")[1] : res;
      resolve({ base64, name: file.name, sizeMB: file.size / (1024 * 1024) });
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

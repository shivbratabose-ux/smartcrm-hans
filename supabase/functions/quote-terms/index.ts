// Edge Function: quote-terms
// -----------------------------------------------------------------------------
// Public, read-only. Serves the EULA / terms text that an admin writes in the
// CRM (Masters → Quotation Rules → Terms & EULA, "Write it here"), so the
// link printed on a quotation (#/terms/<setId>) opens it without a login.
//
//   POST { id }  →  { ok: true, terms: { id, title, body, updatedAt } }
//
// Returns ONLY the title and text of a terms set that is in "text" mode and
// has text. Nothing else from app_settings (prices, people, config) leaves
// this function. Unknown ids → generic 404.
//
// Deployment:  supabase functions deploy quote-terms

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const id = String(body?.id || "");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return json({ error: "Not found" }, 404);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from("app_settings").select("masters").eq("scope", "org").maybeSingle();
  if (error) return json({ error: "Not available" }, 503);
  const sets = data?.masters?.quotation?.termSets;
  const s = Array.isArray(sets) ? sets.find((x: any) => x && x.id === id) : null;
  const text = String(s?.eulaBody || "");
  if (!s || s.eulaMode !== "text" || !text.trim()) return json({ error: "Not found" }, 404);
  return json({ ok: true, terms: {
    id, title: String(s.eulaTitle || "Terms").slice(0, 200), body: text.slice(0, 200000),
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null,
  } });
});

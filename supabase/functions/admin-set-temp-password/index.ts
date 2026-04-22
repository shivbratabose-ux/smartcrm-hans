// Edge Function: admin-set-temp-password
// -----------------------------------------------------------------------------
// Lets an admin / MD / director set a 24h-expiry temp password for another CRM
// user WITHOUT needing Supabase email delivery. The admin then shares the
// password out-of-band (WhatsApp, phone, in-person). On first sign-in with
// that password, the ForcedPasswordChange modal forces the user to pick their
// own password within the 24h window.
//
// Handles two scenarios:
//   1. Target user has a Supabase auth account → updateUserById with password
//   2. Target user was added by admin and never signed up (no auth_user_id)
//      → createUser with password + email_confirm:true, then link to CRM row
//
// Auth model:
//   - Caller must send their Supabase JWT in Authorization: Bearer <token>
//   - We look up the caller's CRM profile and verify role ∈ {admin, md, director}
//   - Service-role key (only available inside Edge Function env) performs the
//     auth admin mutations. The service_role key NEVER touches the browser.
//
// Deployment:
//   supabase functions deploy admin-set-temp-password
//
// Required env vars (auto-injected by Supabase):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_ROLES = new Set(["admin", "md", "director"]);
const TEMP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Missing Authorization bearer token" }, 401);

    // 1. Identify the caller and verify they're an admin/md/director.
    //    We create a client scoped to the caller's JWT to read their identity.
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userInfo, error: uerr } = await asCaller.auth.getUser();
    if (uerr || !userInfo?.user) return json({ error: "Invalid session" }, 401);

    const callerAuthId = userInfo.user.id;

    // Service-role client bypasses RLS for the admin operations below.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerProfile, error: cperr } = await admin
      .from("users")
      .select("id, role, active")
      .eq("auth_user_id", callerAuthId)
      .single();
    if (cperr || !callerProfile) {
      return json({ error: "Caller has no CRM profile" }, 403);
    }
    if (!callerProfile.active) {
      return json({ error: "Caller is deactivated" }, 403);
    }
    if (!ADMIN_ROLES.has(String(callerProfile.role || "").toLowerCase())) {
      return json({ error: "Only admin / md / director can reset passwords" }, 403);
    }

    // 2. Parse + validate the request body.
    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body.target_user_id;
    const tempPassword: string | undefined = body.temp_password;
    if (!targetUserId || typeof targetUserId !== "string") {
      return json({ error: "target_user_id required" }, 400);
    }
    if (!tempPassword || typeof tempPassword !== "string" || tempPassword.length < 8) {
      return json({ error: "temp_password must be at least 8 chars" }, 400);
    }
    if (targetUserId === callerProfile.id) {
      return json(
        { error: "Use your own password-change flow, not admin reset" },
        400,
      );
    }

    // 3. Look up the target CRM row (service-role bypasses RLS).
    const { data: targetRow, error: trerr } = await admin
      .from("users")
      .select("id, email, auth_user_id, name")
      .eq("id", targetUserId)
      .single();
    if (trerr || !targetRow) return json({ error: "Target user not found" }, 404);
    if (!targetRow.email) {
      return json({ error: "Target user has no email on file" }, 400);
    }

    // 4a. Target already has an auth account → just update the password.
    let authUserId = targetRow.auth_user_id as string | null;
    if (authUserId) {
      const { error: upErr } = await admin.auth.admin.updateUserById(authUserId, {
        password: tempPassword,
        email_confirm: true, // idempotent; ensures they can sign in
      });
      if (upErr) return json({ error: `Auth update failed: ${upErr.message}` }, 500);
    } else {
      // 4b. No auth account yet → create one with this password and link it.
      //     email_confirm:true so the user can sign in immediately without
      //     clicking a confirmation email.
      const { data: createRes, error: crErr } = await admin.auth.admin.createUser({
        email: targetRow.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: targetRow.name || null },
      });
      if (crErr || !createRes?.user) {
        // If the auth user actually already exists (race / stale CRM row),
        // fall back to looking them up by email and updating instead.
        const isDup = (crErr?.message || "").toLowerCase().includes("already");
        if (!isDup) {
          return json(
            { error: `Auth create failed: ${crErr?.message || "unknown"}` },
            500,
          );
        }
        const { data: list } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const existing = list?.users?.find(
          (u) => (u.email || "").toLowerCase() === targetRow.email.toLowerCase(),
        );
        if (!existing) {
          return json({ error: "Auth user exists but could not be resolved" }, 500);
        }
        authUserId = existing.id;
        const { error: upErr2 } = await admin.auth.admin.updateUserById(existing.id, {
          password: tempPassword,
          email_confirm: true,
        });
        if (upErr2) {
          return json({ error: `Auth update fallback failed: ${upErr2.message}` }, 500);
        }
      } else {
        authUserId = createRes.user.id;
      }
    }

    // 5. Flag the target row: must_change_password + 24h expiry, and make sure
    //    auth_user_id is linked so they'll resolve to the right CRM profile on
    //    sign-in.
    const expiresAt = new Date(Date.now() + TEMP_WINDOW_MS).toISOString();
    const { error: updErr } = await admin
      .from("users")
      .update({
        auth_user_id: authUserId,
        must_change_password: true,
        temp_password_expires_at: expiresAt,
      })
      .eq("id", targetUserId);
    if (updErr) {
      return json(
        { error: `CRM row update failed: ${updErr.message}` },
        500,
      );
    }

    return json({
      ok: true,
      target_user_id: targetUserId,
      temp_password_expires_at: expiresAt,
    });
  } catch (e) {
    return json({ error: `Unexpected: ${(e as Error).message}` }, 500);
  }
});

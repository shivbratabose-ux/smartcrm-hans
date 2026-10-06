// Client for the notify-leave edge function (supabase/functions/notify-leave).
// Fire-and-forget from the Leave panel: the leave is already saved locally,
// so an email problem is reported but never blocks the request/approval.
// Returns { ok, sentTo?, skipped?, error? }.
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export async function notifyLeave(payload) {
  if (!isSupabaseConfigured) return { ok: false, skipped: "offline" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, skipped: "no_session" };
    const { data, error } = await supabase.functions.invoke("notify-leave", {
      body: payload,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      // Non-2xx: supabase-js puts the Response in error.context.
      let msg = error.message;
      try { msg = (await error.context?.json())?.error || msg; } catch { /* keep generic */ }
      return { ok: false, error: msg };
    }
    return data || { ok: false, error: "Empty response" };
  } catch (e) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

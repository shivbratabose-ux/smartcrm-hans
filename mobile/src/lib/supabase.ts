// Supabase client for the mobile app.
// ─────────────────────────────────────────────────────────────────────────────
// Connects to the SAME Supabase project as the web app — same tables, same
// RLS, same auth users. The two apps are equal-tier clients of the backend.
//
// React Native specifics:
//   - `react-native-url-polyfill/auto` is imported at the top to fix Supabase's
//     internal use of the `URL` constructor (RN's Hermes engine doesn't ship
//     a complete URL implementation; the polyfill patches it).
//   - Auth uses AsyncStorage so the session survives app restarts. Without
//     this the user would have to log in on every launch.
//   - `detectSessionInUrl: false` because we don't have URL params on mobile;
//     deep-link handling for OAuth lives in expo-linking when we add it.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('YOUR-PROJECT')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Fail loud-but-recoverable: if env isn't configured we still let the app
// boot so the developer can see the error screen and fix .env, rather than
// crashing on first render.
export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Copy mobile/.env.example to mobile/.env ' +
      'and fill in EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}

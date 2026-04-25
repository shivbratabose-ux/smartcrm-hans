// AuthContext — single source of truth for the current user.
// ─────────────────────────────────────────────────────────────────────────────
// Why a context (and not just useQuery for `auth.getUser`)?
// Auth state has two listeners: the UI tree (to render gated screens) AND
// the supabase client itself (which fires onAuthStateChange whenever the
// session refreshes / expires). Centralising both in one provider means
// any screen reading `useAuth()` always sees consistent state, and we
// only mount the listener once.
//
// The CRM profile (`users` table row with role / lob / branch) is loaded
// alongside the auth user because most screens need to gate by role
// (sales_exec sees their own leads, country_mgr sees the country's, etc.)

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase';

type CrmProfile = {
  id: string;
  name: string;
  email: string;
  initials: string | null;
  role: string;
  lob: string | null;
  active: boolean;
  branch_id: string | null;
  dept_id: string | null;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: CrmProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithOtp: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CrmProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (authUserId: string) => {
    if (!isSupabaseConfigured) return null;
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, initials, role, lob, active, branch_id, dept_id')
      .eq('auth_user_id', authUserId)
      .single();
    if (error || !data) return null;
    return data as CrmProfile;
  }, []);

  // Boot: read existing session (if any), pull the matching CRM profile.
  // We don't redirect on missing profile — the LoginScreen handles that
  // by signing out and showing the "no CRM profile, contact admin" error.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = requireSupabase();
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        const p = await loadProfile(s.user.id);
        if (mounted) setProfile(p);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        if (!mounted) return;
        setSession(s);
        if (s?.user) {
          const p = await loadProfile(s.user.id);
          if (mounted) setProfile(p);
        } else {
          setProfile(null);
        }
      }
    );

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
    const supabase = requireSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  }, []);

  const signInWithOtp = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
    const supabase = requireSupabase();
    // Email magic-link OTP. SMS OTP requires Twilio config — wired same way
    // when ready: `signInWithOtp({ phone })` instead of `{ email }`.
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error: error?.message || null };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const supabase = requireSupabase();
    await supabase.auth.signOut();
  }, []);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signIn,
    signInWithOtp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

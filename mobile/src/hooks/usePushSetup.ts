// usePushSetup — registers this device for Expo Push and persists the
// token to the user's row. Called once at the root after auth resolves.
// ─────────────────────────────────────────────────────────────────────────────
// Flow:
//   1. Skip on web — Expo Push works on native only (web push uses VAPID,
//      different code path; not in scope).
//   2. Skip on simulators — Expo's getExpoPushTokenAsync rejects there.
//   3. Request notification permission. If denied, exit silently — the
//      app keeps working, just no reminders. We don't badger.
//   4. Get the Expo token.
//   5. Upsert it onto users.expo_push_token (only if changed since last
//      registration to avoid pointless writes).
//
// Token rotation: Expo's docs say tokens are stable per device install
// but can rotate. We re-check on every app start; cheap.

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

// Foreground behavior: when a push arrives while the app is open, show
// a banner + play the sound. Without this the OS suppresses the alert.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // SDK 51 added two granular flags — silence warning by setting both.
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

export function usePushSetup() {
  const { profile, session } = useAuth();

  useEffect(() => {
    // Web has no Expo Push (and the import would noop anyway).
    if (Platform.OS === 'web') return;
    // Need a signed-in user to attach the token to.
    if (!session || !profile?.id || !isSupabaseConfigured) return;

    let cancelled = false;
    (async () => {
      try {
        // 1. Real device only. Simulators / emulators throw on token fetch.
        if (!Device.isDevice) return;

        // 2. Permission flow. Only ask if not already granted; never re-ask.
        const settings = await Notifications.getPermissionsAsync();
        let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        if (!granted && settings.canAskAgain) {
          const ask = await Notifications.requestPermissionsAsync();
          granted = ask.granted;
        }
        if (!granted) return;  // user said no — respect it

        // 3. Set up an Android notification channel (otherwise Android <8
        //    silently drops sounds + the OS warning shows in the dashboard).
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Daily reminders',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#1B6B5A',
          });
        }

        // 4. Fetch the Expo Push token. Requires the EAS project ID for
        //    SDK 49+; reading from app config Constants is the standard.
        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ??
          Constants?.easConfig?.projectId;

        const tokenRes = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined as any
        );
        if (cancelled) return;
        const token = tokenRes.data;
        if (!token) return;

        // 5. Persist if changed. Single-column update, RLS allows the
        //    user to update their own row.
        const sb = requireSupabase();
        const { data: existing } = await sb
          .from('users')
          .select('expo_push_token')
          .eq('id', profile.id)
          .maybeSingle();
        if (existing?.expo_push_token === token) return;  // already up to date
        await sb
          .from('users')
          .update({
            expo_push_token: token,
            push_token_updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
        // Intentionally swallow errors — push setup is best-effort. The
        // user can still use the app fully without it.
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[push-setup] failed:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.id, session]);
}

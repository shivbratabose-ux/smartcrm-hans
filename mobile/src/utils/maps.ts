// Maps deep-link helpers — open the platform's preferred map app to an
// address (or lat/lng), with sensible fallbacks.
// ─────────────────────────────────────────────────────────────────────────────
// The user spec for PR #107 calls out "mobile google map" as a key field-sales
// affordance: from any address shown in the app, one tap should put the user
// on directions. We never embed a map widget here — that needs `react-native-
// maps` + a Google Maps API key + heavy native deps. Deep-linking gets the
// user into Google Maps / Apple Maps in one tap with zero added native code.
//
// Resolution order:
//   Android — `geo:0,0?q=<addr>` (opens whichever map app is set as default,
//             usually Google Maps; `geo:` is the Android intent scheme).
//   iOS     — try `comgooglemaps://?daddr=<addr>` first (Google Maps app);
//             fall back to `maps://?daddr=<addr>` (Apple Maps).
//   Either  — final fallback is a https://www.google.com/maps URL the OS
//             opens in the browser. Always works, even when no map app
//             is installed.
//
// The address may be a free-form string (preferred) OR an explicit
// { lat, lng } pair. Free-form is enough for sales-team needs — Google
// resolves "Acme Corp, MG Road, Bangalore" cleanly.

import { Linking, Platform } from 'react-native';

export type MapsTarget =
  | { kind: 'address'; address: string; label?: string }
  | { kind: 'coords';  lat: number; lng: number; label?: string };

function clean(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

function buildQuery(target: MapsTarget): string {
  if (target.kind === 'coords') {
    const label = target.label ? `(${target.label})` : '';
    return `${target.lat},${target.lng}${label ? `${encodeURIComponent(label)}` : ''}`;
  }
  return encodeURIComponent(clean(target.address));
}

export async function openMaps(target: MapsTarget) {
  if (target.kind === 'address' && !clean(target.address)) return;
  const q = buildQuery(target);

  // Try the platform-native map app first.
  const native = Platform.select({
    android: `geo:0,0?q=${q}`,
    ios:     `comgooglemaps://?daddr=${q}`,
    default: '',
  });

  if (native) {
    try {
      const can = await Linking.canOpenURL(native);
      if (can) {
        await Linking.openURL(native);
        return;
      }
    } catch {
      // fall through to https
    }
  }

  // iOS Apple-Maps fallback (only relevant if Google Maps isn't installed).
  if (Platform.OS === 'ios') {
    const apple = `maps://?daddr=${q}`;
    try {
      const can = await Linking.canOpenURL(apple);
      if (can) {
        await Linking.openURL(apple);
        return;
      }
    } catch { /* fall through */ }
  }

  // Browser fallback — always works.
  const web = target.kind === 'coords'
    ? `https://www.google.com/maps/search/?api=1&query=${target.lat},${target.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
  Linking.openURL(web).catch(() => { /* silent — last resort */ });
}

/** Convenience: open directions from current location to a free-form address. */
export function openDirections(address: string) {
  openMaps({ kind: 'address', address });
}

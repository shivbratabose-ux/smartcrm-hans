// Deep-link helpers — click-to-call, WhatsApp, mailto.
// ─────────────────────────────────────────────────────────────────────────────
// Each function returns void; failures are silent because the user already
// gets the system "No app can handle this" prompt. We don't try to detect
// "is WhatsApp installed?" up front — that's a permission android dislikes
// and the failure case is well-handled by the OS.

import { Linking, Platform } from 'react-native';

// Strip everything except + and digits so the dialler accepts the input
// even when the source phone field has spaces / dashes / parens.
function cleanPhone(phone: string): string {
  return String(phone || '').replace(/[^\d+]/g, '');
}

export function callPhone(phone: string) {
  const p = cleanPhone(phone);
  if (!p) return;
  Linking.openURL(`tel:${p}`).catch(() => {
    // Fallback for emulators that don't have a dialler app — silent.
  });
}

export function openWhatsApp(phone: string, text: string = '') {
  const p = cleanPhone(phone);
  if (!p) return;
  // The whatsapp:// scheme works on both iOS and Android when the app is
  // installed. Without WhatsApp the OS shows its standard "no app" prompt.
  const msg = text ? `&text=${encodeURIComponent(text)}` : '';
  // Strip leading + because WhatsApp expects digits-only after `phone=`.
  const num = p.startsWith('+') ? p.slice(1) : p;
  Linking.openURL(`whatsapp://send?phone=${num}${msg}`).catch(() => {
    // Web fallback — opens chat in the browser. Less native but always works.
    Linking.openURL(`https://wa.me/${num}${msg ? `?text=${encodeURIComponent(text)}` : ''}`);
  });
}

export function openEmail(email: string, subject: string = '', body: string = '') {
  if (!email) return;
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body)    params.push(`body=${encodeURIComponent(body)}`);
  const q = params.length ? `?${params.join('&')}` : '';
  Linking.openURL(`mailto:${email}${q}`).catch(() => {});
}

// Used on the Dashboard's "Share meeting" action — pre-fills the user's
// preferred messenger with a meeting summary.
export function shareViaWhatsApp(text: string) {
  // No phone → opens the WhatsApp share sheet (user picks the recipient)
  Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`)
    .catch(() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`));
}

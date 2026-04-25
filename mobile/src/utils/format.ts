// Tiny formatting helpers shared across screens.
// Mirrors the web app's `fmt` utilities so the two products show the same
// strings for the same data.

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  // "21 Mar 2026" — short, unambiguous, locale-friendly enough.
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRelativeDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 864e5);
  if (days === 0)  return 'Today';
  if (days === 1)  return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0 && days < 7) return `In ${days} days`;
  if (days < 0 && days > -7) return `${-days} days ago`;
  return fmtDate(iso);
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return String(name).split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(iso?: string | null): boolean {
  if (!iso) return false;
  const today = todayIso();
  return iso.slice(0, 10) < today;
}

export function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  return iso.slice(0, 10) === todayIso();
}

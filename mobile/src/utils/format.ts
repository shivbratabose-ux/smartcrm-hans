// Tiny formatting helpers shared across screens.
// Mirrors the web app's `fmt` utilities so the two products show the same
// strings for the same data.

// ── Calendar dates ───────────────────────────────────────────────────
// The CRM's date fields are DATE columns — calendar days ("2026-08-08"),
// not instants. `toISOString()` formats in UTC, which answers the wrong
// question for them, and our users are IST (+05:30):
//
//   - `todayIso()` returned YESTERDAY between 00:00 and 05:30, so the
//     Today and Plan tabs showed the previous day's agenda to anyone
//     opening the app early.
//   - Worse, the native date pickers hand back a Date at LOCAL midnight.
//     Formatting that with toISOString subtracts the offset and lands on
//     the previous day — so picking "15 Aug" in Reschedule saved "14 Aug",
//     every time, for every IST user.
//
// Format from, and parse into, the local calendar instead.
//
// Timestamp columns (created_at / updated_at) are genuine instants and
// still use `new Date().toISOString()` — those are correct as UTC and are
// deliberately untouched.

export function toLocalISODate(d: Date | string | null = new Date()): string {
  // A default argument only fires for `undefined`, and `new Date(null)` is
  // the epoch — without this guard an empty date renders as 1970-01-01.
  if (d == null || d === '') return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Mirror image: `new Date("2026-08-08")` parses as UTC midnight, so any
// arithmetic or rendering built on it drifts by the UTC offset.
//
// A bare date is a calendar day, so it becomes local midnight. Anything
// with a time component is a real instant, so we take the local calendar
// day THAT instant falls on — which is what someone reading a timestamp
// on their phone means by "what day was this".
export function parseLocalDate(value?: string | Date | null): Date {
  if (value == null || value === '') return new Date(NaN);
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (bare) return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Whole calendar days from today to `iso` (negative = past).
export function daysFromToday(iso?: string | null): number | null {
  const target = parseLocalDate(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = parseLocalDate(new Date());
  return Math.round((target.getTime() - today.getTime()) / 864e5);
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = parseLocalDate(iso);
  if (isNaN(d.getTime())) return '—';
  // "21 Mar 2026" — short, unambiguous, locale-friendly enough.
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRelativeDate(iso?: string | null): string {
  if (!iso) return '—';
  const days = daysFromToday(iso);
  if (days === null) return '—';
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
  return toLocalISODate(new Date());
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

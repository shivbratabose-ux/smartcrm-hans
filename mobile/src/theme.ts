// Design tokens — single source of truth for the mobile app's visual system.
// ─────────────────────────────────────────────────────────────────────────────
// PR #103 overhaul: tokens are now grouped by intent (brand / surface /
// severity / typography / spacing / radii / elevation) and include gradient
// + severity-color presets so every screen renders the same visual grammar.
//
// Mirrors the web app's CSS variables wherever possible so the two products
// feel like one system.

// ── Brand & surface ──
export const colors = {
  // Brand
  brand:        '#1B6B5A',
  brandDark:    '#134D41',
  brandDarker:  '#0D3830',
  brandLight:   '#EBF7F4',
  brandGlow:    'rgba(27,107,90,0.15)',

  // Surface
  bg:        '#F2F5F8',
  surface:   '#FFFFFF',
  s2:        '#F8FAFB',
  s3:        '#EEF2F6',

  // Borders
  border:    '#E2E9EF',
  border2:   '#C8D4DF',

  // Text
  text:      '#0D1F2D',
  text2:     '#4A6070',
  text3:     '#8BA3B4',
  textInv:   '#FFFFFF',

  // Severity (used for status chips / row tints)
  red:       '#DC2626',
  redBg:     '#FEF2F2',
  amber:     '#D97706',
  amberBg:   '#FFFBEB',
  green:     '#16A34A',
  greenBg:   '#F0FDF4',
  blue:      '#2563EB',
  blueBg:    '#EFF6FF',
  purple:    '#7C3AED',
  purpleBg:  '#F5F3FF',
  teal:      '#0D9488',
  tealBg:    '#F0FDFA',
} as const;

// ── Gradients ──
// Used by GradientHeader on every screen's top strip and the Login hero.
// Two-tone vertical gradients keep the brand identity recognisable while
// adding the visual depth a flat color lacks.
export const gradients = {
  brand:    ['#1B6B5A', '#2A8A74'] as const,        // primary header
  brandDeep:['#0D3830', '#1B6B5A'] as const,        // login hero, deeper
  amber:    ['#F59E0B', '#D97706'] as const,        // overdue / urgent banner
  green:    ['#22C55E', '#16A34A'] as const,        // won / success banner
} as const;

// ── Severity tokens ──
// Map a "severity" semantic name to its tint pair so chips/badges are
// consistent across screens. Pulls from `colors` so theme tweaks
// propagate.
export type Severity = 'overdue' | 'today' | 'planned' | 'done' | 'neutral' | 'won' | 'lost';

export const severity: Record<Severity, { fg: string; bg: string; label: string }> = {
  overdue: { fg: colors.red,    bg: colors.redBg,    label: 'Overdue' },
  today:   { fg: colors.amber,  bg: colors.amberBg,  label: 'Today' },
  planned: { fg: colors.blue,   bg: colors.blueBg,   label: 'Planned' },
  done:    { fg: colors.green,  bg: colors.greenBg,  label: 'Done' },
  neutral: { fg: colors.text2,  bg: colors.s3,       label: '—' },
  won:     { fg: colors.green,  bg: colors.greenBg,  label: 'Won' },
  lost:    { fg: colors.red,    bg: colors.redBg,    label: 'Lost' },
};

// ── Typography scale ──
// Larger-than-web font sizes — fingers are imprecise, screens are small,
// and "built for one-hand mobile use" was an explicit product requirement.
export const fontSize = {
  xs:   12,
  sm:   14,
  md:   16,
  lg:   18,
  xl:   22,
  xxl:  28,
  hero: 32,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium:  '500' as const,
  semi:    '600' as const,
  bold:    '700' as const,
  heavy:   '800' as const,
};

// ── Spacing scale ──
// Multiples of 4 because they snap to pixel boundaries on every density
// (mdpi / hdpi / xhdpi / xxhdpi / xxxhdpi).
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
  xxxl:40,
} as const;

// ── Radii ──
export const radii = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   18,
  pill: 999,
} as const;

// ── Elevation (shadow + lift) ──
// React Native's `elevation` (Android) and `shadow*` (iOS) need both, so
// each level returns the full set. Apply via `...elevation.md`.
export const elevation = {
  none: { elevation: 0 },
  sm: {
    elevation: 2,
    shadowColor: '#0D1F2D',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  md: {
    elevation: 4,
    shadowColor: '#0D1F2D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  lg: {
    elevation: 8,
    shadowColor: '#0D1F2D',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
  },
  xl: {
    elevation: 16,
    shadowColor: '#0D1F2D',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
  },
} as const;

// ── Hit-target minimums ──
// Material recommends 48dp. We use 44 as a soft floor for icon-only
// pressables and 48 for primary buttons.
export const tap = {
  iconBtn: 44,
  primary: 48,
} as const;

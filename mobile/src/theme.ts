// Design tokens for the mobile app. Mirrors the web app's CSS variables
// (var(--brand), var(--text), var(--border) etc.) so the two products feel
// like one system. Keep this file flat — no nested theming systems, no
// dynamic light/dark switching yet.
export const colors = {
  brand:     '#1B6B5A',
  brandDark: '#134D41',
  brandLight:'#EBF7F4',

  bg:      '#F2F5F8',
  surface: '#FFFFFF',
  s2:      '#F8FAFB',
  s3:      '#EEF2F6',

  border:  '#E2E9EF',
  border2: '#C8D4DF',

  text:  '#0D1F2D',
  text2: '#4A6070',
  text3: '#8BA3B4',

  red:    '#DC2626',
  redBg:  '#FEF2F2',
  amber:  '#D97706',
  amberBg:'#FFFBEB',
  green:  '#16A34A',
  greenBg:'#F0FDF4',
  blue:   '#2563EB',
  blueBg: '#EFF6FF',
  purple: '#7C3AED',
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
} as const;

// Larger-than-web font sizes — fingers are imprecise, screens are small.
// "Built for one-hand mobile use" was an explicit requirement from the
// product brief. Anything below 13px on mobile is unreadable for users
// over 40, which is a big chunk of the sales team.
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

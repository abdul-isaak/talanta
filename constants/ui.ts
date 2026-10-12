/**
 * Design tokens for the Talanta dark scouting theme.
 * Screens should pull colours, spacing and type sizes from here so the
 * whole app stays visually consistent.
 */
export const C = {
  bg: '#0d1b2a',
  bgDeep: '#071d33',
  surface: '#132233',
  surfaceAlt: '#0a2540',
  surfaceRaised: '#18293d',
  border: '#1e3448',
  borderStrong: '#2e4a5e',
  text: '#ffffff',
  textSoft: 'rgba(255,255,255,0.78)',
  muted: '#7a99b0',
  dim: '#4a6070',
  primary: '#3BE097',
  primarySoft: 'rgba(59,224,151,0.14)',
  onPrimary: '#0d1b2a',
  danger: '#ff6b6b',
  dangerSoft: 'rgba(255,107,107,0.14)',
  warning: '#f5a623',
  warningSoft: 'rgba(245,166,35,0.14)',
  info: '#4a9eff',
  infoSoft: 'rgba(74,158,255,0.14)',
  overlay: 'rgba(0,0,0,0.55)',
  black: '#000000',
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const T = {
  caption: 11,
  small: 12,
  body: 14,
  bodyLg: 15,
  title: 17,
  h2: 20,
  h1: 26,
} as const;

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

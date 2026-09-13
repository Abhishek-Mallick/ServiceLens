// Single source of truth for the DESIGN.md system (Resend dark editorial).
//
// tailwind.config.ts builds its palette and radii from this file, and
// tests/design-tokens.test.ts keeps it identical to DESIGN.md. Components use
// the Tailwind classes (bg-surface-card, text-mute, border-hairline-strong…);
// code that needs raw values — SVG strokes, React Flow props — imports them
// from here. Nothing hard-codes a color.

export const colors = {
  primary: '#fcfdff',
  'primary-on': '#000000',
  ink: '#fcfdff',
  body: 'rgba(252,253,255,0.86)',
  charcoal: 'rgba(252,253,255,0.7)',
  mute: '#a1a4a5',
  ash: '#888e90',
  stone: '#464a4d',
  'on-light': '#000000',
  'on-light-mute': 'rgba(0,0,51,0.7)',
  canvas: '#000000',
  'surface-card': '#0a0a0c',
  'surface-elevated': '#101012',
  'surface-deep': '#06060a',
  hairline: 'rgba(255,255,255,0.06)',
  'hairline-strong': 'rgba(255,255,255,0.14)',
  'divider-soft': 'rgba(255,255,255,0.04)',
  'accent-orange': '#ff801f',
  'accent-orange-glow': 'rgba(255,89,0,0.22)',
  'accent-yellow': '#ffc53d',
  'accent-blue': '#3b9eff',
  'accent-blue-glow': 'rgba(0,117,255,0.34)',
  'accent-green': '#11ff99',
  'accent-green-glow': 'rgba(34,255,153,0.18)',
  'accent-red': '#ff2047',
  'accent-red-glow': 'rgba(255,32,71,0.34)',
  link: '#3b9eff',
  'surface-light': '#f1f7fe',
} as const;

export type ColorToken = keyof typeof colors;

export const rounded = {
  none: '0px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const spacing = {
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  xxxl: '48px',
  section: '96px',
  band: '128px',
} as const;

// Values DESIGN.md describes in prose rather than as named colors.
export const derived = {
  scrim: 'rgba(0,0,0,0.8)', // dialogs: "80% black scrim instead of a shadow"
  minimapMask: 'rgba(0,0,0,0.6)',
} as const;

// ── Semantic mappings used across the product ──────────────────────────────
export const statusColor = {
  healthy: colors['accent-green'],
  degraded: colors['accent-yellow'],
  down: colors['accent-red'],
  unknown: colors.stone,
} as const;

export const severityColor = {
  critical: colors['accent-red'],
  warning: colors['accent-orange'],
  info: colors['accent-blue'],
} as const;

export const edgeColor = {
  rest: colors['accent-blue'],
  grpc: colors['accent-yellow'],
  event: colors['accent-orange'],
  kafka: colors['accent-orange'],
  database: colors.ash,
} as const;

export function statusOf(status: string | null | undefined): keyof typeof statusColor {
  return status && status in statusColor ? (status as keyof typeof statusColor) : 'unknown';
}

// Tailwind palette: every token (except `primary`, which stays the shadcn
// semantic color backed by a CSS variable) plus status-*/severity-* aliases.
export function tailwindColors(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) if (k !== 'primary') out[k] = v;
  for (const [k, v] of Object.entries(statusColor)) out[`status-${k}`] = v;
  for (const [k, v] of Object.entries(severityColor)) out[`severity-${k}`] = v;
  return out;
}

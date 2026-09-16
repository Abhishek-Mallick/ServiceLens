// Raw color hexes needed at JS runtime (chart SVGs, React Flow edges, email HTML).
// UI class colors come from shadcn semantic tokens in globals.css / tailwind.config.ts.

export const colors = {
  // Neutrals — align with shadcn zinc.
  foreground: '#0a0a0a',
  mutedForeground: '#71717a',
  border: '#e4e4e7',
  card: '#ffffff',
  cardElevated: '#f4f4f5',
  slate: '#64748b',
  // Accents for status / chart series.
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  orange: '#f97316',
} as const;

export const rounded = {
  none: '0px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const derived = {
  scrim: 'rgba(0,0,0,0.8)',
  minimapMask: 'rgba(0,0,0,0.6)',
} as const;

export const statusColor = {
  healthy: colors.emerald,
  degraded: colors.amber,
  down: colors.red,
  unknown: colors.slate,
} as const;

export const severityColor = {
  critical: colors.red,
  warning: colors.orange,
  info: colors.blue,
} as const;

export const edgeColor = {
  rest: colors.blue,
  grpc: colors.amber,
  event: colors.orange,
  kafka: colors.orange,
  database: colors.slate,
} as const;

export function statusOf(status: string | null | undefined): keyof typeof statusColor {
  return status && status in statusColor ? (status as keyof typeof statusColor) : 'unknown';
}

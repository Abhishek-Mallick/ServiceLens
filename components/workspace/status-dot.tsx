import { cn } from '@/lib/utils';
import { severityColor, statusColor, statusOf } from '@/lib/design-tokens';

export function StatusDot({ status, pulse = false, className }: { status: string; pulse?: boolean; className?: string }) {
  const color = statusColor[statusOf(status)];
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5 shrink-0', className)} aria-label={statusOf(status)}>
      {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />}
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function SeverityPill({ severity, label }: { severity: string; label?: string }) {
  const color = severityColor[(severity in severityColor ? severity : 'info') as keyof typeof severityColor];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background" style={{ background: color }}>
      {label ?? severity}
    </span>
  );
}

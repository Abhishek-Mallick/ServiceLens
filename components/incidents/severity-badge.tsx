import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  info: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  warning: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  critical: 'bg-accent-red/10 text-accent-red border-accent-red/30',
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const s = styles[severity] ?? styles.info;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', s, className)}>
      {severity}
    </span>
  );
}

import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  info: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  critical: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const s = styles[severity] ?? styles.info;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', s, className)}>
      {severity}
    </span>
  );
}

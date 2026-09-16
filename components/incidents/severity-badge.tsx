import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  critical: 'bg-red-500/10 text-red-500 border-red-500/30',
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const s = styles[severity] ?? styles.info;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', s, className)}>
      {severity}
    </span>
  );
}

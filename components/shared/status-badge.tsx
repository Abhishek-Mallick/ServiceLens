import { cn } from '@/lib/utils';

// DESIGN.md atmospheric accents — never solid backgrounds, only 10% wash + ring.
const styles: Record<string, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  degraded: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  down: 'bg-red-500/10 text-red-500 border-red-500/30',
  unknown: 'bg-border/50 text-muted-foreground border-border',
  completed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  passed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  failed: 'bg-red-500/10 text-red-500 border-red-500/30',
  running: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  pending: 'bg-border/50 text-muted-foreground border-border',
  analyzing: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  ready: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  draft: 'bg-border/50 text-muted-foreground border-border',
  error: 'bg-red-500/10 text-red-500 border-red-500/30',
  acknowledged: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  resolved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  open: 'bg-red-500/10 text-red-500 border-red-500/30',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase();
  const style = styles[key] ?? styles.unknown;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', style, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-emerald-500': key === 'healthy' || key === 'passed' || key === 'completed' || key === 'ready' || key === 'resolved',
        'bg-orange-500': key === 'degraded',
        'bg-red-500': key === 'down' || key === 'failed' || key === 'error' || key === 'open',
        'bg-blue-500 animate-pulse': key === 'running' || key === 'analyzing' || key === 'acknowledged',
        'bg-foreground/40': key === 'pending' || key === 'unknown' || key === 'draft',
      })} />
      {status}
    </span>
  );
}

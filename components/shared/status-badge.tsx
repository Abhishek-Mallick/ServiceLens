import { cn } from '@/lib/utils';

// DESIGN.md atmospheric accents — never solid backgrounds, only 10% wash + ring.
const styles: Record<string, string> = {
  healthy: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  degraded: 'bg-accent-orange/10 text-accent-orange border-accent-orange/30',
  down: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  unknown: 'bg-white/[0.04] text-white/60 border-white/10',
  completed: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  passed: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  failed: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  running: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  pending: 'bg-white/[0.04] text-white/60 border-white/10',
  analyzing: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  ready: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  draft: 'bg-white/[0.04] text-white/60 border-white/10',
  error: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  acknowledged: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  resolved: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  open: 'bg-accent-red/10 text-accent-red border-accent-red/30',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase();
  const style = styles[key] ?? styles.unknown;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', style, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-accent-green': key === 'healthy' || key === 'passed' || key === 'completed' || key === 'ready' || key === 'resolved',
        'bg-accent-orange': key === 'degraded',
        'bg-accent-red': key === 'down' || key === 'failed' || key === 'error' || key === 'open',
        'bg-accent-blue animate-pulse': key === 'running' || key === 'analyzing' || key === 'acknowledged',
        'bg-white/40': key === 'pending' || key === 'unknown' || key === 'draft',
      })} />
      {status}
    </span>
  );
}

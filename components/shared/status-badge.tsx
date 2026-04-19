import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  healthy: 'bg-success/10 text-success border-success/30',
  degraded: 'bg-warning/10 text-warning border-warning/30',
  down: 'bg-destructive/10 text-destructive border-destructive/30',
  unknown: 'bg-muted text-muted-foreground border-border',
  completed: 'bg-success/10 text-success border-success/30',
  passed: 'bg-success/10 text-success border-success/30',
  failed: 'bg-destructive/10 text-destructive border-destructive/30',
  running: 'bg-primary/10 text-primary border-primary/30',
  pending: 'bg-muted text-muted-foreground border-border',
  analyzing: 'bg-primary/10 text-primary border-primary/30',
  ready: 'bg-success/10 text-success border-success/30',
  draft: 'bg-muted text-muted-foreground border-border',
  error: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase();
  const style = styles[key] ?? styles.unknown;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize', style, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-success': key === 'healthy' || key === 'passed' || key === 'completed' || key === 'ready',
        'bg-warning': key === 'degraded',
        'bg-destructive': key === 'down' || key === 'failed' || key === 'error',
        'bg-primary animate-pulse': key === 'running' || key === 'analyzing',
        'bg-muted-foreground': key === 'pending' || key === 'unknown' || key === 'draft',
      })} />
      {status}
    </span>
  );
}

import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SimulatedBadge({ className, label = 'Simulated' }: { className?: string; label?: string }) {
  return (
    <span
      title="This data is generated for demo purposes — no real probe or run produced it."
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400',
        className
      )}
    >
      <FlaskConical className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

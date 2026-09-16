import { statusColor, statusOf } from '@/lib/design-tokens';

// One bar per check (oldest → newest): height is latency, color is status.
// Down checks (no latency) render full-height so outages stand out.
export function HealthBars({ points }: { points: Array<{ status: string; rt: number | null; at: string }> }) {
  if (points.length === 0) return <div className="text-[12px] text-muted-foreground">No checks yet.</div>;
  const max = Math.max(...points.map((p) => p.rt ?? 0), 1);
  const w = 300;
  const h = 44;
  const gap = 1;
  const bw = Math.max(1, (w - gap * (points.length - 1)) / points.length);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none" role="img" aria-label={`Last ${points.length} health checks`}>
      {points.map((p, i) => {
        const s = statusOf(p.status);
        const bh = s === 'down' || p.rt == null ? h : Math.max(3, (p.rt / max) * h);
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={1} fill={statusColor[s]} opacity={s === 'healthy' ? 0.55 : 1}><title>{`${p.status}${p.rt != null ? ` · ${p.rt} ms` : ''} · ${new Date(p.at).toLocaleTimeString()}`}</title></rect>;
      })}
    </svg>
  );
}

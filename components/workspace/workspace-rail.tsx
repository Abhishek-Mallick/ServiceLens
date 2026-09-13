'use client';
import Link from 'next/link';
import { Activity, AlertTriangle, FlaskConical, GitMerge, GitPullRequest, PhoneCall, Server, Sparkles } from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import type { ActivityItem, ActivityKind, OncallPerson, WorkspaceIncident } from '@/lib/workspace-types';
import { SeverityPill } from './status-dot';

const KIND_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  incident: AlertTriangle,
  fix: GitPullRequest,
  service: Server,
  analysis: Sparkles,
  topology: GitMerge,
  tests: FlaskConical,
  oncall: PhoneCall,
  health: Activity,
};

function RailSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-hairline px-4 py-4 last:border-b-0">
      <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.15em] text-mute">
        {title}
        {count != null && <span className="rounded-full bg-surface-elevated px-1.5 text-[10px] text-body">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

export function WorkspaceRail({
  architectureId,
  demo,
  canOwn,
  incidents,
  oncall,
  activity,
}: {
  architectureId: string;
  demo: boolean;
  canOwn: boolean;
  incidents: WorkspaceIncident[];
  oncall: { configured: boolean; people: OncallPerson[] };
  activity: ActivityItem[];
}) {
  const base = `/architectures/${architectureId}`;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-deep">
      <RailSection title="Open incidents" count={incidents.length}>
        {incidents.length === 0 && <div className="text-[13px] text-mute">Nothing open. All quiet.</div>}
        <div className="space-y-2">
          {incidents.slice(0, 8).map((i) => (
            <Link key={i.id} href={`${base}/incidents/${i.id}`} className="block space-y-1 rounded-md border border-hairline bg-surface-card p-2.5 hover:border-hairline-strong">
              <div className="flex items-center gap-2">
                <SeverityPill severity={i.severity} />
                <span className="text-[11px] capitalize text-mute">{i.status}</span>
                <span className="ml-auto text-[11px] text-mute">{formatRelative(new Date(i.openedAt))}</span>
              </div>
              <div className="line-clamp-2 text-[13px] text-ink">{i.title}</div>
              {(i.oncall || i.fixPr?.url) && (
                <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-mute">
                  {i.oncall && <span className="inline-flex items-center gap-1"><PhoneCall className="h-3 w-3" />{i.oncall.name}</span>}
                  {i.fixPr?.url && <span className="inline-flex items-center gap-1 text-link"><GitPullRequest className="h-3 w-3" />fix PR {i.fixPr.state ?? ''}</span>}
                </div>
              )}
            </Link>
          ))}
          {incidents.length > 8 && <Link href={`${base}/incidents`} className="text-[12px] text-link hover:underline">All {incidents.length} incidents</Link>}
        </div>
      </RailSection>

      {!demo && (
        <RailSection title="On call">
          {!oncall.configured ? (
            <div className="text-[13px] text-mute">
              No on-call directory yet.{' '}
              {canOwn && <Link href={`${base}/alerts`} className="text-link hover:underline">Connect your rota sheet</Link>}
            </div>
          ) : oncall.people.length === 0 ? (
            <div className="text-[13px] text-mute">The directory doesn&apos;t cover any service yet.</div>
          ) : (
            <div className="space-y-2">
              {oncall.people.map((p) => (
                <div key={p.email}>
                  <div className="text-[13px] text-ink">{p.name}</div>
                  <div className="truncate text-[11px] text-mute">{p.services.join(', ')}</div>
                </div>
              ))}
            </div>
          )}
        </RailSection>
      )}

      <RailSection title="Activity">
        {activity.length === 0 && <div className="text-[13px] text-mute">No activity in the last 3 days.</div>}
        <ol className="space-y-2.5">
          {activity.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? Activity;
            const body = (
              <>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mute" />
                <span className="min-w-0">
                  <span className="block text-[12px] leading-snug text-body">{a.title}</span>
                  <span className="block text-[11px] text-mute">
                    {formatRelative(new Date(a.at))}
                    {a.detail ? ` · ${a.detail}` : ''}
                  </span>
                </span>
              </>
            );
            return (
              <li key={a.id}>
                {a.href ? <Link href={a.href} className="flex gap-2 hover:[&_span]:text-ink">{body}</Link> : <div className="flex gap-2">{body}</div>}
              </li>
            );
          })}
        </ol>
      </RailSection>
    </div>
  );
}

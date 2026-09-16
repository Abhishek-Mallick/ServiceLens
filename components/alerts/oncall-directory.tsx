'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import { serviceKey } from '@/lib/oncall/keys';

export interface RosterRow { service: string; name: string; email: string; escalationEmail: string | null }
export interface OncallSourceInfo { csvUrl: string; escalateAfterMin: number; lastFetchedAt: string | null; lastError: string | null }

export function OncallDirectory({
  architectureId,
  canEdit,
  serviceNames,
  initial,
}: {
  architectureId: string;
  canEdit: boolean;
  serviceNames: string[];
  initial: { source: OncallSourceInfo | null; roster: RosterRow[] };
}) {
  const [csvUrl, setCsvUrl] = useState(initial.source?.csvUrl ?? '');
  const [escalate, setEscalate] = useState(String(initial.source?.escalateAfterMin ?? 15));
  const [roster, setRoster] = useState(initial.roster);
  const [source, setSource] = useState(initial.source);
  const [busy, setBusy] = useState<'save' | 'refresh' | null>(null);

  async function save() {
    setBusy('save');
    const r = await fetch(`/api/architectures/${architectureId}/oncall`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvUrl, escalateAfterMin: Number(escalate) || 0 }),
    });
    const body = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { toast.error(body?.error ?? 'Could not save the on-call directory'); return; }
    setRoster(body.roster); setSource(body.source);
    toast.success(`On-call directory saved · ${body.roster.length} rows`);
    if (body.warnings?.length) toast.warning(body.warnings.slice(0, 2).join(' '));
  }

  async function refresh() {
    setBusy('refresh');
    const r = await fetch(`/api/architectures/${architectureId}/oncall/refresh`, { method: 'POST' });
    const body = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { toast.error(body?.error ?? 'Refresh failed'); return; }
    setRoster(body.roster);
    setSource((s) => (s ? { ...s, lastFetchedAt: body.lastFetchedAt, lastError: body.lastError } : s));
    if (body.errors?.length) toast.warning(body.errors[0]); else toast.success('Roster refreshed');
  }

  // Which services have nobody (and no "*" fallback) to page?
  const hasFallback = roster.some((r) => r.service.trim() === '*');
  const covered = new Set(roster.map((r) => serviceKey(r.service)));
  const uncovered = hasFallback ? [] : serviceNames.filter((n) => !covered.has(serviceKey(n)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">On-call directory</CardTitle>
        <CardDescription>
          When an incident opens, ServiceLens emails the on-call engineer for that service, even if they don&apos;t have a ServiceLens account. If nobody acknowledges in time, it pages the escalation contact.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <div className="space-y-1.5">
            <Label htmlFor="oncall-url">Published CSV URL</Label>
            <Input id="oncall-url" value={csvUrl} onChange={(e) => setCsvUrl(e.target.value)} disabled={!canEdit}
              placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" type="url" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oncall-escalate">Escalate after (min)</Label>
            <Input id="oncall-escalate" value={escalate} onChange={(e) => setEscalate(e.target.value)} disabled={!canEdit} inputMode="numeric" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          In Google Sheets choose File → Share → Publish to web → <em>Comma-separated values</em>. Columns:{' '}
          <code>service_name, oncall_name, oncall_email, escalation_email</code>. A <code>*</code> row covers every service without its own row. Set escalation to 0 to turn it off.
        </p>
        {canEdit && (
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy !== null || !csvUrl.trim()}>
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & test'}
            </Button>
            {source && (
              <Button variant="outline" onClick={refresh} disabled={busy !== null}>
                <RefreshCw className={`h-3.5 w-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Refresh now
              </Button>
            )}
          </div>
        )}

        {source && (
          <div className="text-[12px] text-muted-foreground">
            Last fetched {source.lastFetchedAt ? formatRelative(new Date(source.lastFetchedAt)) : 'never'} · refreshed automatically every 5 min when paging
            {source.lastError && <div className="text-yellow-500 mt-1">{source.lastError}</div>}
          </div>
        )}

        {roster.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-[12px]">
              <thead className="text-left text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Service</th><th className="px-3 py-2 font-medium">On-call</th><th className="px-3 py-2 font-medium">Escalation</th></tr>
              </thead>
              <tbody>
                {roster.map((r, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono">{r.service}</td>
                    <td className="px-3 py-2">{r.name} <span className="text-muted-foreground">&lt;{r.email}&gt;</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{r.escalationEmail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {source && uncovered.length > 0 && (
          <p className="text-[12px] text-yellow-500">No one is on call for: {uncovered.join(', ')}. Add rows for them or a <code>*</code> fallback row.</p>
        )}
      </CardContent>
    </Card>
  );
}

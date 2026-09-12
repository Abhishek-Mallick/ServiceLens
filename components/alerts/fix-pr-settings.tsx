'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function FixPrSettings({
  architectureId,
  canEdit,
  initialAuto,
  githubConfigured,
}: {
  architectureId: string;
  canEdit: boolean;
  initialAuto: boolean;
  githubConfigured: boolean;
}) {
  const [auto, setAuto] = useState(initialAuto);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const r = await fetch(`/api/architectures/${architectureId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoFixPr: !auto }),
    });
    setSaving(false);
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      toast.error(b?.error ?? 'Could not update');
      return;
    }
    setAuto(!auto);
    toast.success(!auto ? 'Automatic fix PRs on' : 'Automatic fix PRs off');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Automatic fix PRs</CardTitle>
        <CardDescription>
          When on, once an incident&apos;s RCA is ready ServiceLens reads the affected service&apos;s source, generates a fix, and opens a <strong>draft</strong> pull request.
          It never merges, opens at most one PR per repository per hour, and refuses if the files changed since the fix was generated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 p-3">
          <div className="text-sm">
            Status: <span className={auto ? 'text-emerald-400' : 'text-muted-foreground'}>{auto ? 'On' : 'Off'}</span>
            <div className="text-[12px] text-muted-foreground mt-0.5">Off means fixes are generated and opened only when someone clicks on the incident page.</div>
          </div>
          {canEdit && (
            <Button size="sm" variant={auto ? 'outline' : 'default'} onClick={toggle} disabled={saving || (!auto && !githubConfigured)}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : auto ? 'Turn off' : 'Turn on'}
            </Button>
          )}
        </div>
        {!githubConfigured && (
          <p className="text-[12px] text-amber-400">
            The ServiceLens GitHub App isn&apos;t configured on this deployment (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY), so PRs can&apos;t be opened.
          </p>
        )}
        {githubConfigured && (
          <p className="text-[12px] text-muted-foreground">Each service&apos;s repository must have the ServiceLens GitHub App installed. If it doesn&apos;t, the incident page shows an install link.</p>
        )}
      </CardContent>
    </Card>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2, Zap } from 'lucide-react';

export function TriggerSyntheticButton({ architectureId }: { architectureId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function trigger() {
    setBusy(true);
    const res = await fetch(`/api/architectures/${architectureId}/synthetic-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!res.ok) { toast.error('Could not trigger incident'); return; }
    const j = await res.json();
    toast.success('Synthetic incident opened');
    router.push(`/architectures/${architectureId}/incidents/${j.incidentId}`);
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={trigger} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
      Trigger incident
    </Button>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, CheckCircle2, Loader2, MessageSquare } from 'lucide-react';

export function IncidentActions({ incidentId, status }: { incidentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');

  async function call(path: string, body: object, key: string, successMsg: string) {
    setBusy(key);
    const res = await fetch(`/api/incidents/${incidentId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) { toast.error(`${path} failed`); return false; }
    toast.success(successMsg);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {status === 'open' && (
          <Button size="sm" variant="outline" onClick={() => call('ack', {}, 'ack', 'Acknowledged')} disabled={busy === 'ack'}>
            {busy === 'ack' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Acknowledge
          </Button>
        )}
        {status !== 'resolved' && (
          <Button size="sm" onClick={async () => {
            const ok = await call('resolve', { resolution }, 'resolve', 'Resolved');
            if (ok) setResolution('');
          }} disabled={busy === 'resolve'}>
            {busy === 'resolve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Resolve
          </Button>
        )}
      </div>

      {status !== 'resolved' && (
        <div className="space-y-2">
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Resolution notes (what fixed it) — saved into the incident timeline + reused for runbook memory."
            rows={2}
          />
        </div>
      )}

      <div className="space-y-2">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment to the timeline…" rows={2} />
        <Button size="sm" variant="outline" disabled={busy === 'comment' || !comment.trim()}
          onClick={async () => {
            const ok = await call('comment', { text: comment }, 'comment', 'Comment added');
            if (ok) setComment('');
          }}>
          {busy === 'comment' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
          Comment
        </Button>
      </div>
    </div>
  );
}

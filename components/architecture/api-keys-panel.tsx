'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { formatRelative } from '@/lib/utils';

export interface ApiKeyRow { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

export function ApiKeysPanel({ architectureId, appUrl, initialKeys }: { architectureId: string; appUrl: string; initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    const r = await fetch(`/api/architectures/${architectureId}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(j.error ?? 'Could not create key'); return; }
    setFresh(j.key);
    setKeys((k) => [{ ...j.apiKey, createdAt: j.apiKey.createdAt, lastUsedAt: null, revokedAt: null }, ...k]);
    setName('');
  }

  async function revoke(id: string) {
    const r = await fetch(`/api/architectures/${architectureId}/api-keys/${id}`, { method: 'DELETE' });
    setConfirming(null);
    if (!r.ok) { toast.error('Could not revoke'); return; }
    setKeys((k) => k.map((x) => (x.id === id ? { ...x, revokedAt: new Date().toISOString() } : x)));
    toast.success('Key revoked');
  }

  const base = appUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const example = `curl -X PUT ${base}/api/v1/services/orders \\
  -H "Authorization: Bearer ${fresh ?? '$SERVICELENS_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{"repoUrl":"https://github.com/acme/orders","deployedUrl":"https://orders.acme.com"}'`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> API keys</CardTitle>
        <CardDescription>
          Register and update services from CI or an AI agent without the UI. Every service can register itself on deploy.
          Agents can follow <a href={`${base}/SKILL.md`} target="_blank" rel="noreferrer" className="underline">{base}/SKILL.md</a>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder='Key name, e.g. "GitHub Actions"' value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={create} disabled={busy || !name.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create key'}</Button>
        </div>

        {fresh && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
            <div className="text-[12px] text-emerald-400">Copy this key now. It won&apos;t be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate font-mono text-[12px]">{fresh}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(fresh); toast.success('Key copied'); }}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <pre className="rounded-md border border-border/60 bg-black/40 p-3 text-[11px] font-mono overflow-x-auto whitespace-pre">{example}</pre>

        {keys.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full text-[12px]">
              <thead className="text-left text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Key</th><th className="px-3 py-2 font-medium">Last used</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-border/60">
                    <td className="px-3 py-2">{k.name}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{k.prefix}…</td>
                    <td className="px-3 py-2 text-muted-foreground">{k.lastUsedAt ? formatRelative(new Date(k.lastUsedAt)) : 'never'}</td>
                    <td className="px-3 py-2 text-right">
                      {k.revokedAt ? (
                        <span className="text-muted-foreground">revoked</span>
                      ) : confirming === k.id ? (
                        <Button size="sm" variant="destructive" onClick={() => revoke(k.id)}>Confirm revoke</Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(k.id)}>Revoke</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

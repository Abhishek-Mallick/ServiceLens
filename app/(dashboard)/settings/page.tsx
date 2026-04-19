import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { isAIEnabled } from '@/lib/openrouter';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const aiEnabled = isAIEnabled();

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Workspace configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={session?.user?.name ?? ''} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={session?.user?.email ?? ''} readOnly />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            AI integration
            <Badge variant={aiEnabled ? 'success' : 'secondary'}>{aiEnabled ? 'Connected' : 'Disabled'}</Badge>
          </CardTitle>
          <CardDescription>OpenRouter powers the service analysis, topology inference, and regression summaries.</CardDescription>
        </CardHeader>
        <CardContent>
          {aiEnabled ? (
            <div className="text-sm">
              Using model <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{process.env.OPENROUTER_MODEL ?? 'default free model'}</span>.
              Free-tier OpenRouter models are called for every service analysis.
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Set <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">OPENROUTER_API_KEY</code> in your <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">.env</code> to enable live AI-powered analysis. Without it, MeshRegress falls back to the local heuristic analyzer.
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                <li>Get a free key at openrouter.ai</li>
                <li>Free-tier models include Llama 3.3 70B and Mistral Small 3.1</li>
                <li>Seeded demo data will render fully even without a key</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Infrastructure</CardTitle>
          <CardDescription>Local services detected</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Database" value="SQLite (dev.db)" status="connected" />
          <Row label="Auth" value="NextAuth (credentials)" status="connected" />
          <Row label="Redis / BullMQ" value="Optional — uses in-process queue" status="optional" />
          <Row label="Socket.IO" value="Polling every 30s in dashboard" status="connected" />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, status }: { label: string; value: string; status: 'connected' | 'optional' }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{value}</div>
      </div>
      <Badge variant={status === 'connected' ? 'success' : 'secondary'}>{status}</Badge>
    </div>
  );
}

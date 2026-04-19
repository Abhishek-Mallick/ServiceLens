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
            AI-powered analysis
            <Badge variant={aiEnabled ? 'success' : 'secondary'}>{aiEnabled ? 'Enabled' : 'Unavailable'}</Badge>
          </CardTitle>
          <CardDescription>
            Service analysis, topology inference, and regression summaries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {aiEnabled
              ? 'AI-powered insights are active across your workspace.'
              : 'AI insights are temporarily unavailable. Heuristic analysis is being used instead.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

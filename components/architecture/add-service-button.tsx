'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Sparkles } from 'lucide-react';

export function AddServiceButton({ architectureId }: { architectureId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [deployedUrl, setDeployedUrl] = useState('');
  const [healthPath, setHealthPath] = useState('/health');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/architectures/${architectureId}/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, repoUrl, branch, deployedUrl: deployedUrl.trim() || null, healthPath }),
    });
    if (!res.ok) {
      setLoading(false);
      const body = await res.json().catch(() => ({}));
      const fieldErrors = body?.details?.fieldErrors as Record<string, string[]> | undefined;
      toast.error(fieldErrors ? Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') : body?.error ?? 'Could not add service');
      return;
    }
    const { service } = await res.json();
    setOpen(false);
    setName('');
    setRepoUrl('');
    setDeployedUrl('');
    setHealthPath('/health');
    toast.success(deployedUrl.trim() ? 'Service registered — health checks start within a minute.' : 'Service registered.');
    // Read the repo straight away so the topology picks the service up.
    const ares = await fetch(`/api/architectures/${architectureId}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceIds: [service.id] }),
    });
    const summary = await ares.json().catch(() => null);
    setLoading(false);
    if (summary?.failed?.length) toast.error(`Repo analysis failed: ${summary.failed[0].error}`);
    router.refresh();
  }

  async function triggerAnalyze() {
    setAnalyzing(true);
    const res = await fetch(`/api/architectures/${architectureId}/analyze`, { method: 'POST' });
    setAnalyzing(false);
    const summary = await res.json().catch(() => null);
    if (!res.ok || !summary) {
      toast.error('Analysis failed');
      return;
    }
    if (summary.failed?.length) toast.warning(`${summary.failed.length} repo(s) failed: ${summary.failed[0].error}`);
    else toast.success(`Analysis complete · ${summary.edges} dependencies`);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={triggerAnalyze} disabled={analyzing}>
        {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Re-analyze
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" />}><Plus className="h-3.5 w-3.5" /> Add service</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register a service</DialogTitle>
            <DialogDescription>We read the repo through the GitHub API to map its endpoints and dependencies, and health-check the deployed URL every minute.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="svc-name">Service name</Label>
              <Input id="svc-name" placeholder="Order Service" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-repo">Git repo URL</Label>
              <Input id="svc-repo" placeholder="https://github.com/org/order-service" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} type="url" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-url">Deployed URL</Label>
              <Input id="svc-url" placeholder="https://orders.acme.com" value={deployedUrl} onChange={(e) => setDeployedUrl(e.target.value)} type="url" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="svc-health">Health path</Label>
                <Input id="svc-health" value={healthPath} onChange={(e) => setHealthPath(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="svc-branch">Branch</Label>
                <Input id="svc-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading || !name || !repoUrl}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add service'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

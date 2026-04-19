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
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/architectures/${architectureId}/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, repoUrl, branch }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error('Could not add service');
      return;
    }
    toast.success('Service added — click "Analyze" to start AI discovery.');
    setOpen(false);
    setName('');
    setRepoUrl('');
    router.refresh();
  }

  async function triggerAnalyze() {
    setAnalyzing(true);
    const res = await fetch(`/api/architectures/${architectureId}/analyze`, { method: 'POST' });
    setAnalyzing(false);
    if (!res.ok) {
      toast.error('Analysis failed');
      return;
    }
    toast.success('Analysis complete');
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={triggerAnalyze} disabled={analyzing}>
        {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Analyze all
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="h-3.5 w-3.5" /> Add service</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register a service</DialogTitle>
            <DialogDescription>MeshRegress will shallow-clone the repo and analyze it.</DialogDescription>
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
              <Label htmlFor="svc-branch">Branch</Label>
              <Input id="svc-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
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

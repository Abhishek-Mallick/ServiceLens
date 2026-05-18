'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Boxes, GitBranch, Loader2, Radio, Sparkles, Workflow } from 'lucide-react';
import { TEMPLATES, type ArchitectureTemplate } from '@/lib/architecture-templates';
import { cn } from '@/lib/utils';

const ICONS: Record<ArchitectureTemplate['id'], React.ComponentType<{ className?: string }>> = {
  blank: Sparkles,
  ecommerce: Boxes,
  saas: Workflow,
  streaming: Radio,
};

export default function NewArchitecturePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<ArchitectureTemplate['id']>('blank');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  async function submit() {
    setLoading(true);
    const res = await fetch('/api/architectures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, templateId }),
    });
    setLoading(false);
    if (!res.ok) { toast.error('Could not create architecture'); return; }
    const data = await res.json();
    toast.success(templateId === 'blank' ? 'Architecture created' : 'Architecture created from template');
    router.push(`/architectures/${data.architecture.id}`);
  }

  return (
    <div className="px-6 lg:px-10 py-10 max-w-3xl mx-auto">
      <Link href="/architectures" className="text-[11px] uppercase tracking-[0.2em] text-white/50 inline-flex items-center gap-1 mb-6 hover:text-ink">
        <ArrowLeft className="h-3 w-3" /> Architectures
      </Link>

      <div className="mb-2 text-[11px] uppercase tracking-[0.25em] text-white/50">Step {step} of 2</div>
      <h1 className="font-display text-[44px] leading-[1.05] tracking-tight text-ink mb-2">
        {step === 1 ? 'Name your mesh.' : 'Pick a starting point.'}
      </h1>
      <p className="text-white/60 text-[14px] max-w-md mb-8">
        {step === 1
          ? "We'll create the architecture and wire it up to the topology, regression, and incident pipelines."
          : "Templates pre-populate a few stubbed services so you don't stare at an empty graph. You can edit or re-bind any of them later."}
      </p>

      {step === 1 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="E-Commerce Platform" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="What does this mesh power?" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" asChild><Link href="/architectures">Cancel</Link></Button>
              <Button onClick={() => setStep(2)} disabled={!name.trim()}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATES.map((t) => {
              const Icon = ICONS[t.id];
              const selected = templateId === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={cn(
                    'text-left rounded-lg border p-5 transition-colors',
                    selected ? 'border-ink bg-white/[0.04]' : 'border-white/[0.08] hover:border-white/[0.2] bg-surface-card'
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-md', selected ? 'bg-ink text-canvas' : 'bg-white/[0.04] text-ink')}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[15px] font-medium text-ink">{t.name}</div>
                      <div className="text-[11px] uppercase tracking-wide text-white/50">{t.tagline}</div>
                    </div>
                  </div>
                  <p className="text-[13px] text-white/70">{t.description}</p>
                  {t.services.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {t.services.slice(0, 5).map((s) => (
                        <span key={s.name} className="inline-flex items-center gap-1 rounded-full bg-surface-elevated border border-white/[0.06] px-2 py-0.5 text-[10px] text-white/60">
                          <GitBranch className="h-2.5 w-2.5" />{s.name}
                        </span>
                      ))}
                      {t.services.length > 5 && <span className="text-[10px] text-white/40">+{t.services.length - 5}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between gap-2 mt-6">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={submit} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create architecture'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

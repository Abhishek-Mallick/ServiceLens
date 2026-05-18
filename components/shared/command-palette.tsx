'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Boxes, LayoutDashboard, Search, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Hit {
  id: string;
  type: 'arch' | 'service' | 'incident' | 'nav';
  title: string;
  subtitle?: string;
  href: string;
  severity?: string;
}

const NAV: Hit[] = [
  { id: 'nav-dash', type: 'nav', title: 'Dashboard', href: '/dashboard' },
  { id: 'nav-archs', type: 'nav', title: 'Architectures', href: '/architectures' },
  { id: 'nav-new', type: 'nav', title: 'New architecture', href: '/architectures/new' },
  { id: 'nav-settings', type: 'nav', title: 'Settings', href: '/settings' },
];

function iconFor(t: Hit['type']) {
  if (t === 'arch') return Boxes;
  if (t === 'service') return Server;
  if (t === 'incident') return AlertTriangle;
  return LayoutDashboard;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef(0);

  // ⌘K / Ctrl-K to open. Single-key shortcuts (g d / g a / g i) elsewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // "g then d/a/i/n" leader-key navigation when palette is closed.
  useEffect(() => {
    let pending = false;
    let timer: NodeJS.Timeout | null = null;
    function onKey(e: KeyboardEvent) {
      if (open) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!pending && e.key.toLowerCase() === 'g') {
        pending = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { pending = false; }, 1200);
        return;
      }
      if (pending) {
        pending = false;
        if (timer) clearTimeout(timer);
        const k = e.key.toLowerCase();
        const map: Record<string, string> = { d: '/dashboard', a: '/architectures', i: '/architectures', n: '/architectures/new', s: '/settings' };
        if (map[k]) { e.preventDefault(); router.push(map[k]); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); };
  }, [open, router]);

  const search = useCallback(async (term: string) => {
    const seq = ++reqRef.current;
    const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (seq !== reqRef.current) return; // stale
    const next: Hit[] = [];
    if (term.trim() === '') next.push(...NAV);
    for (const a of data.architectures ?? []) next.push({ id: `a-${a.id}`, type: 'arch', title: a.name, href: `/architectures/${a.id}` });
    for (const s of data.services ?? []) next.push({ id: `s-${s.id}`, type: 'service', title: s.name, subtitle: s.framework ?? undefined, href: `/architectures/${s.architectureId}/services/${s.id}` });
    for (const i of data.incidents ?? []) next.push({ id: `i-${i.id}`, type: 'incident', title: i.title, severity: i.severity, href: `/architectures/${i.architectureId}/incidents/${i.id}` });
    setHits(next);
    setActive(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => search(q), 120);
    return () => clearTimeout(t);
  }, [open, q, search]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function go(h: Hit) {
    setOpen(false);
    setQ('');
    router.push(h.href);
  }

  const grouped = useMemo(() => {
    const order: Hit['type'][] = ['arch', 'service', 'incident', 'nav'];
    const labels: Record<Hit['type'], string> = { arch: 'Architectures', service: 'Services', incident: 'Incidents', nav: 'Navigate' };
    const groups = order.map((t) => ({ type: t, label: labels[t], items: hits.filter((h) => h.type === t) }));
    return groups.filter((g) => g.items.length > 0);
  }, [hits]);

  const flatHits = grouped.flatMap((g) => g.items);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4" role="dialog" aria-modal="true">
      <button aria-label="Close palette" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl rounded-lg border border-white/[0.14] bg-surface-elevated overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
          <Search className="h-4 w-4 text-white/40" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search architectures, services, incidents…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-white/40 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flatHits.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter' && flatHits[active]) { e.preventDefault(); go(flatHits[active]); }
            }}
          />
          <kbd className="hidden md:inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/50">esc</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto py-1">
          {flatHits.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-white/50">No matches.</div>
          )}
          {grouped.map((g) => (
            <div key={g.type}>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-white/40">{g.label}</div>
              {g.items.map((h) => {
                const Icon = iconFor(h.type);
                const idx = flatHits.indexOf(h);
                const isActive = idx === active;
                return (
                  <button
                    key={h.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(h)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left text-sm',
                      isActive ? 'bg-white/[0.04] text-ink' : 'text-white/80 hover:bg-white/[0.02]'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', h.type === 'incident' && h.severity === 'critical' ? 'text-accent-red' : h.type === 'incident' ? 'text-accent-orange' : 'text-white/60')} />
                    <span className="flex-1 truncate">
                      {h.title}
                      {h.subtitle && <span className="ml-2 text-[11px] text-white/40">{h.subtitle}</span>}
                    </span>
                    <ArrowRight className="h-3 w-3 text-white/40" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="border-t border-white/[0.06] px-3 py-2 text-[10px] text-white/40 flex items-center gap-4">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>⏎</kbd> open</span>
          <span><kbd>g</kbd> then <kbd>d</kbd>/<kbd>a</kbd>/<kbd>n</kbd>/<kbd>s</kbd> · quick nav</span>
          <span className="ml-auto"><kbd>⌘K</kbd></span>
        </div>
      </div>
    </div>
  );
}

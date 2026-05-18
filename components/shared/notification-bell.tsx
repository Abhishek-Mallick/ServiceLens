'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatRelative } from '@/lib/utils';
import { useArchitectureEvents } from '@/lib/hooks/use-architecture-events';

interface NotifRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  severity: string | null;
  createdAt: string;
  readAt: string | null;
}

export function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [unread, setUnread] = useState(0);
  const popRef = useRef<HTMLDivElement>(null);
  // Best-effort: if the user is on an architecture page, subscribe to that
  // arch's SSE and refresh on incident_opened. Otherwise the 30s poll covers it.
  const archMatch = pathname?.match(/^\/architectures\/([^/]+)/);
  const archId = archMatch ? archMatch[1] : null;

  async function load() {
    try {
      const r = await fetch('/api/notifications');
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.notifications);
      setUnread(j.unreadCount);
    } catch { /* silent */ }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  useArchitectureEvents(archId, (ev) => {
    if (ev.kind === 'incident_opened' || ev.kind === 'incident_resolved' || ev.kind === 'incident_updated') {
      load();
    }
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function markAll() {
    await fetch('/api/notifications', { method: 'POST' });
    await load();
  }

  async function markOne(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, readAt: new Date().toISOString() } : r)));
    setUnread((c) => Math.max(0, c - 1));
  }

  return (
    <div className="relative" ref={popRef}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-black">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-[360px] rounded-lg border border-border/60 bg-popover shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <div className="text-sm font-medium">Notifications</div>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border/40">
            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">You're all caught up.</div>
            )}
            {items.map((n) => {
              const body = (
                <div className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className={cn('mt-1 h-1.5 w-1.5 rounded-full shrink-0', {
                      'bg-rose-500': n.severity === 'critical',
                      'bg-amber-500': n.severity === 'warning',
                      'bg-sky-500': !n.severity || n.severity === 'info',
                    })} />
                    <div className="min-w-0 flex-1">
                      <div className={cn('text-sm', !n.readAt && 'font-medium')}>{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-muted-foreground mt-1">{formatRelative(n.createdAt)}</div>
                    </div>
                  </div>
                </div>
              );
              return n.href ? (
                <Link key={n.id} href={n.href} onClick={() => { markOne(n.id); setOpen(false); }} className="block hover:bg-accent/30">
                  {body}
                </Link>
              ) : (
                <button key={n.id} onClick={() => markOne(n.id)} className="block w-full text-left hover:bg-accent/30">
                  {body}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

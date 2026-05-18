'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/shared/notification-bell';

interface HeaderProps {
  user: { name?: string | null; email?: string | null; image?: string | null };
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  // next-themes resolves theme on the client only — defer rendering the toggle
  // icon until after mount so the server's neutral SVG matches what hydrates.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const segments = pathname.split('/').filter(Boolean);

  function openPalette() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-white/[0.06] bg-canvas/70 px-6 backdrop-blur">
      <nav className="flex items-center gap-1 text-[12px] text-white/50 min-w-0">
        {segments.map((seg, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/');
          const last = i === segments.length - 1;
          return (
            <span key={href} className="flex items-center gap-1 truncate">
              {i > 0 && <span className="text-white/20">/</span>}
              <Link href={href} className={last ? 'font-medium text-ink truncate' : 'hover:text-ink truncate'}>
                {decodeURIComponent(seg).replace(/-/g, ' ')}
              </Link>
            </span>
          );
        })}
      </nav>

      {/* ⌘K palette trigger — replaces the static search box. */}
      <button
        onClick={openPalette}
        className="ml-auto hidden md:inline-flex max-w-sm flex-1 items-center gap-2 rounded-md border border-white/[0.08] bg-surface-elevated px-3 h-9 text-[12px] text-white/50 hover:border-white/[0.2] transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search architectures, services, incidents…</span>
        <kbd className="ml-auto rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/60">⌘K</kbd>
      </button>

      <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} suppressHydrationWarning>
        {!mounted ? <Moon className="h-4 w-4" /> : theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <NotificationBell />
      <div className="flex items-center gap-3 border-l border-white/[0.06] pl-4">
        <div className="hidden text-right sm:block">
          <div className="text-[13px] font-medium leading-tight text-ink">{user.name ?? 'Demo User'}</div>
          <div className="text-[11px] text-white/50 leading-tight">{user.email}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated border border-white/[0.08] text-sm font-medium text-ink">
          {(user.name ?? user.email ?? 'D')[0]?.toUpperCase()}
        </div>
        <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: '/login' })}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

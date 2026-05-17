'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificationBell } from '@/components/shared/notification-bell';

interface HeaderProps {
  user: { name?: string | null; email?: string | null; image?: string | null };
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border/60 bg-background/70 px-6 backdrop-blur">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
        {segments.map((seg, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/');
          const last = i === segments.length - 1;
          return (
            <span key={href} className="flex items-center gap-1 truncate">
              {i > 0 && <span className="text-border">/</span>}
              <Link href={href} className={last ? 'font-medium text-foreground truncate' : 'hover:text-foreground truncate'}>
                {decodeURIComponent(seg).replace(/-/g, ' ')}
              </Link>
            </span>
          );
        })}
      </nav>

      <div className="relative ml-auto hidden max-w-sm flex-1 md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search services, events, APIs..." className="pl-9 h-9 bg-muted/40" />
      </div>

      <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <NotificationBell />
      <div className="flex items-center gap-3 border-l border-border/60 pl-4">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium leading-tight">{user.name ?? 'Demo User'}</div>
          <div className="text-xs text-muted-foreground leading-tight">{user.email}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
          {(user.name ?? user.email ?? 'D')[0]?.toUpperCase()}
        </div>
        <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: '/login' })}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
    window.dispatchEvent(new CustomEvent('command-palette:open'));
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border/50 bg-background/70 px-6 backdrop-blur">
      <nav className="flex items-center gap-1 text-[12px] text-muted-foreground min-w-0">
        {segments.map((seg, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/');
          const last = i === segments.length - 1;
          return (
            <span key={href} className="flex items-center gap-1 truncate">
              {i > 0 && <span className="text-muted-foreground/60">/</span>}
              <Link href={href} className={last ? 'font-medium text-foreground truncate' : 'hover:text-foreground truncate'}>
                {decodeURIComponent(seg).replace(/-/g, ' ')}
              </Link>
            </span>
          );
        })}
      </nav>

      {/* ⌘K palette trigger — replaces the static search box. */}
      <button
        onClick={openPalette}
        className="ml-auto hidden md:inline-flex w-52 shrink-0 items-center gap-2 rounded-md border border-border bg-muted px-3 h-9 text-[12px] text-muted-foreground hover:border-border transition-colors"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Search architectures, services, incidents…</span>
        <kbd className="ml-auto rounded border border-border bg-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
      </button>

      <NotificationBell />
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            }
          >
            <Avatar size="default">
              {user.image ? <AvatarImage src={user.image} alt={user.name ?? 'User'} /> : null}
              <AvatarFallback className="text-sm font-medium text-foreground">
                {(user.name ?? user.email ?? 'D')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{user.name ?? 'Demo User'}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun className="h-4 w-4" />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={mounted ? theme : undefined}
                  onValueChange={setTheme}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="h-4 w-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="h-4 w-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="h-4 w-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Settings, Activity, Boxes } from 'lucide-react';
import { AppLogo } from '@/components/shared/app-logo';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/architectures', label: 'Architectures', icon: Boxes },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/50 bg-background lg:flex">
      <div className="flex h-16 items-center border-b border-border/50 pl-4">
        <AppLogo href="/dashboard" size="sm" textClassName="text-2xl" />
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors',
                active ? 'text-foreground bg-border/50' : 'text-muted-foreground hover:text-foreground hover:bg-border/50'
              )}
            >
              {/* DESIGN.md — active item gets a 2px accent-blue rail (only place blue solid appears) */}
              {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-blue-500" />}
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/50 p-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3 text-emerald-500" />
          <span>All systems nominal</span>
        </div>
      </div>
    </aside>
  );
}

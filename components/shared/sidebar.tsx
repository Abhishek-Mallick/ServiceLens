'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, Settings, Activity, Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/architectures', label: 'Architectures', icon: Boxes },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-canvas lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/[0.06] px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.04] text-ink">
          <Network className="h-4 w-4" />
        </div>
        <span className="text-[15px] font-medium tracking-tight text-ink">ServiceLens</span>
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
                active ? 'text-ink bg-white/[0.04]' : 'text-white/60 hover:text-ink hover:bg-white/[0.03]'
              )}
            >
              {/* DESIGN.md — active item gets a 2px accent-blue rail (only place blue solid appears) */}
              {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent-blue" />}
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/[0.06] p-4 text-[11px] text-white/50">
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3 text-accent-green" />
          <span>All systems nominal</span>
        </div>
      </div>
    </aside>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function ArchitectureTabs({ architectureId }: { architectureId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/architectures/${architectureId}`, label: 'Overview', exact: true },
    { href: `/architectures/${architectureId}/topology`, label: 'Topology' },
    { href: `/architectures/${architectureId}/services`, label: 'Services' },
    { href: `/architectures/${architectureId}/regression`, label: 'Regression' },
    { href: `/architectures/${architectureId}/health`, label: 'Health' },
  ];

  return (
    <div className="mt-5 -mb-4 flex gap-1 border-b border-transparent">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'relative px-3 py-2 text-sm transition-colors',
              active ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {active && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-primary" />}
          </Link>
        );
      })}
    </div>
  );
}

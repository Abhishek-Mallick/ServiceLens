import Link from 'next/link';
import { AppLogo } from '@/components/shared/app-logo';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';

type LandingNavProps = {
  isLoggedIn: boolean;
};

const links = ['Platform', 'Observability', 'Incidents', 'Pricing'];

export function LandingNav({ isLoggedIn }: LandingNavProps) {
  const ctaHref = isLoggedIn ? '/dashboard' : '/register';
  const ctaLabel = isLoggedIn ? 'Open dashboard' : 'Start for free';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 md:px-6">
        <AppLogo href="/" size="sm" textClassName="hidden sm:inline text-2xl" />

        {/* <nav className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary">
          {links.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link}
            </a>
          ))}
        </nav> */}

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link href="/login">Login</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

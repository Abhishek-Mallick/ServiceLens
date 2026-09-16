import Link from 'next/link';
import { AppLogo } from '@/components/shared/app-logo';

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-background px-6 py-12 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <AppLogo size="sm" />
          <p className="mt-2">The mesh, observed.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/login" className="hover:text-foreground">
            Login
          </Link>
          <Link href="/register" className="hover:text-foreground">
            Sign up
          </Link>
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}

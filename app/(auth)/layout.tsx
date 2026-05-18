import Link from 'next/link';
import { Network } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-canvas">
      <div className="absolute inset-0 -z-10 glow-blue" />
      <div className="flex w-full flex-col items-center justify-center px-6 py-10">
        <Link href="/" className="mb-6 flex items-center gap-2 text-[15px] font-medium tracking-tight text-ink">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-ink">
            <Network className="h-4 w-4" />
          </div>
          ServiceLens
        </Link>
        <h1 className="font-display text-[56px] leading-[1.05] tracking-tight text-ink text-center max-w-xl mb-10">
          The mesh, observed.
        </h1>
        {children}
        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.2em] text-white/50">
          Infer · Map · Regress
        </p>
      </div>
    </div>
  );
}

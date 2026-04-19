import Link from 'next/link';
import { Network } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,hsl(239_84%_67%/0.25),transparent_55%),radial-gradient(circle_at_bottom_left,hsl(152_60%_45%/0.18),transparent_55%)]" />
      <div className="flex w-full flex-col items-center justify-center px-6 py-10">
        <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Network className="h-5 w-5" />
          </div>
          MeshRegress
        </Link>
        {children}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          See everything. Test everything. Break nothing.
        </p>
      </div>
    </div>
  );
}

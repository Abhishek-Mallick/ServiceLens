import Link from 'next/link';
import { Button } from '@/components/ui/button';

type LandingCtaProps = {
  ctaHref: string;
};

export function LandingCta({ ctaHref }: LandingCtaProps) {
  return (
    <section id="pricing" className="border-b border-border/60 px-6 py-24 md:px-8 md:py-32">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
          Build for the agent era of operations
        </h2>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
          Onboard from GitHub, map dependencies from code, and let ServiceLens watch the mesh while
          you ship.
        </p>
        <Button asChild size="lg">
          <Link href={ctaHref}>Start building for free</Link>
        </Button>
      </div>
    </section>
  );
}

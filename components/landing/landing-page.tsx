import { LandingNav } from './landing-nav';
import { LandingHero } from './landing-hero';
import { LandingRegion } from './landing-region';
import { LandingTopology } from './landing-topology';
import { LandingCta } from './landing-cta';
import { LandingFooter } from './landing-footer';

type LandingPageProps = {
  isLoggedIn: boolean;
};

export function LandingPage({ isLoggedIn }: LandingPageProps) {
  const ctaHref = isLoggedIn ? '/dashboard' : '/register';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav isLoggedIn={isLoggedIn} />
      <main>
        <LandingHero ctaHref={ctaHref} />
        <LandingRegion />
        <LandingTopology />
        <LandingCta ctaHref={ctaHref} />
      </main>
      <LandingFooter />
    </div>
  );
}

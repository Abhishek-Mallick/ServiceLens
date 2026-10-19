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

      <div className="mx-auto mt-10 flex max-w-7xl flex-wrap items-center justify-center gap-4">
        <span
          style={{
            display: 'inline-block',
            textAlign: 'center',
            fontFamily: 'system-ui,sans-serif',
            lineHeight: 1,
          }}
        >
          <a
            href="https://tools.launchllama.co/products/servicelens?utm_source=badge&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', lineHeight: 0 }}
          >
            <img
              src="https://tools.launchllama.co/featured-badge.png?v=2"
              alt="Featured on Launch"
              width={200}
              height={52}
              style={{ display: 'block', border: 0 }}
            />
          </a>
          <a
            href="https://launchmcp.co/?utm_source=badge&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              marginTop: -2,
              paddingTop: 0,
              fontSize: 7,
              fontWeight: 600,
              color: '#888',
              textDecoration: 'none',
              lineHeight: 1,
              letterSpacing: '0.02em',
            }}
          >
            Launch
          </a>
        </span>

        <a href="https://launchnest.io/p/servicelens" target="_blank" rel="noopener noreferrer">
          <img
            src="https://launchnest.io/badge/servicelens.svg?variant=featured"
            alt="ServiceLens on LaunchNest"
            width={220}
            height={56}
          />
        </a>

        <a
          href="https://easydofollow.dev/dev-tools/servicelens"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://easydofollow.dev/badge/easydofollow-badge-light.svg"
            alt="Featured on EasyDoFollow"
            width={188}
            height={56}
          />
        </a>

        <a href="https://launchit.fast" target="_blank" rel="noopener noreferrer">
          <img
            src="https://launchit.fast/img/launching.svg"
            alt="Featured on LaunchIt"
            height={56}
          />
        </a>

        <a href="https://noonlaunch.com/product/servicelens" rel="dofollow">
          <img
            src="https://noonlaunch.com/badges/servicelens.svg?theme=dark"
            alt="Featured on Noonlaunch"
            width={220}
            height={60}
          />
        </a>

        <a
          href="https://startupfa.me/s/servicelens?utm_source=servicelens.buildlab.in"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://startupfa.me/badges/featured-badge.webp"
            alt="ServiceLens - Featured on Startup Fame"
            width={171}
            height={54}
          />
        </a>

        <a
          href="https://nicklaunches.com/products/servicelens/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://nicklaunches.com/badges/featured-dark.png"
            alt="ServiceLens on Nick Launches"
            width={244}
            height={56}
          />
        </a>

        <a
          href="https://www.codehype.ai/product/servicelens?utm_source=codehype_badge"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://www.codehype.ai/badges/servicelens.svg?variant=find-us&v=20"
            alt="Featured on CodeHype"
            width={180}
            height={65}
            loading="lazy"
            decoding="async"
            style={{
              display: 'inline-block',
              border: 0,
              width: '100%',
              maxWidth: 180,
              height: 'auto',
              maxHeight: 65,
            }}
          />
        </a>

        <a
          href="https://launchon.it/products/servicelens"
          target="_blank"
          rel="noopener noreferrer"
          title="ServiceLens - Featured on LaunchOnIt"
        >
          <img
            src="https://launchon.it/api/badge/servicelens?theme=dark&size=md&type=featured"
            alt="ServiceLens - Featured on LaunchOnIt"
            height={56}
          />
        </a>

        <a href="https://twelve.tools" target="_blank" rel="noopener noreferrer">
          <img
            src="https://twelve.tools/badge2-dark.svg"
            alt="Featured on Twelve Tools"
            width={148}
            height={40}
          />
        </a>
      </div>
    </footer>
  );
}

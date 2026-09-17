'use client';

import type { ReactNode } from 'react';
import { LandingFlickerCard } from '@/components/landing/landing-flicker-card';

type LandingFeatureCardProps = {
  mock: ReactNode;
  title: string;
  body: string;
};

export function LandingFeatureCard({ mock, title, body }: LandingFeatureCardProps) {
  return (
    <LandingFlickerCard className="row-span-3 grid grid-rows-subgrid gap-0" contentClassName="contents p-0">
      <div className="relative z-10 px-6 pt-6">{mock}</div>
      <h3 className="relative z-10 px-6 pt-5 text-lg font-semibold">{title}</h3>
      <p className="relative z-10 px-6 pb-6 pt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </LandingFlickerCard>
  );
}

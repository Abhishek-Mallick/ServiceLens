'use client';

import type { ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent } from '@/components/ui/card';
import { FlickeringGrid } from '@/components/ui/flickering-grid';
import { cn } from '@/lib/utils';

type LandingFlickerCardProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function LandingFlickerCard({ children, className, contentClassName }: LandingFlickerCardProps) {
  const { resolvedTheme } = useTheme();
  const color = resolvedTheme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';

  return (
    <Card className={cn('relative overflow-hidden bg-card py-0', className)}>
      <FlickeringGrid
        className="absolute inset-0 z-0"
        color={color}
        squareSize={3}
        gridGap={3}
        flickerChance={0.16}
        maxOpacity={0.08}
      />
      <CardContent className={cn('relative z-10 p-6', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

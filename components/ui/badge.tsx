import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// DESIGN.md badge-pill — surface-elevated, caption type, rounded-full, no shadow.
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-surface-elevated text-white/86 border border-white/[0.08]',
        secondary: 'bg-surface-elevated text-white/70 border border-white/[0.08]',
        destructive: 'bg-accent-red/10 text-accent-red border border-accent-red/30',
        success: 'bg-accent-green/10 text-accent-green border border-accent-green/30',
        warning: 'bg-accent-orange/10 text-accent-orange border border-accent-orange/30',
        outline: 'text-ink border border-white/[0.14]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// DESIGN.md badge-pill — surface-elevated, caption type, rounded-full, no shadow.
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-surface-elevated text-body border border-hairline-strong',
        secondary: 'bg-surface-elevated text-charcoal border border-hairline-strong',
        destructive: 'bg-accent-red/10 text-accent-red border border-accent-red/30',
        success: 'bg-accent-green/10 text-accent-green border border-accent-green/30',
        warning: 'bg-accent-orange/10 text-accent-orange border border-accent-orange/30',
        outline: 'text-ink border border-hairline-strong',
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

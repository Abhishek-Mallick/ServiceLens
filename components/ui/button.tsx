import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// DESIGN.md — buttons at rounded-md (8px), 36px tall, type button-md.
// Primary is the white-pill CTA (scarce, one per viewport). Ghost is the
// surface-elevated secondary. Outline is canvas + hairline.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink/60 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-ink text-canvas hover:bg-ink/90 active:bg-ink/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'bg-canvas text-ink border border-white/10 hover:border-white/25 hover:bg-white/[0.03]',
        secondary: 'bg-surface-elevated text-ink border border-white/10 hover:bg-white/[0.04]',
        ghost: 'text-ink hover:bg-white/[0.05]',
        link: 'text-accent-blue underline-offset-4 hover:underline',
        success: 'bg-success text-success-foreground hover:bg-success/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-[13px]',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

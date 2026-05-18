import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // DESIGN.md text-input: surface-card bg, hairline-strong border, focus thickens to ink (no separate ring).
        'flex h-10 w-full rounded-md border border-white/[0.14] bg-surface-card px-3 py-2 text-sm text-ink placeholder:text-white/40 transition-colors',
        'focus-visible:outline-none focus-visible:border-ink',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };

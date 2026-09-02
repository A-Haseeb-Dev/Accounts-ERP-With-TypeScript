import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-teal-700 text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.15),0_1px_2px_rgba(13,148,136,0.25)] hover:bg-teal-600 disabled:bg-teal-800/50 disabled:shadow-none',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:bg-slate-100/50',
  outline: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 disabled:bg-red-600/50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
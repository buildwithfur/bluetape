import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  leftIcon?: ReactNode
  children?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-xs font-medium select-none ' +
  'transition-[transform,background-color,color,border-color] duration-[120ms] ' +
  'active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-accent/40 disabled:opacity-50 disabled:pointer-events-none ' +
  'motion-reduce:transition-none'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-text-on-accent hover:bg-accent-hover',
  secondary:
    'bg-transparent text-ink-700 border border-border-line hover:bg-surface-hover',
  ghost: 'bg-transparent text-ink-700 hover:bg-surface-active',
  danger:
    'bg-transparent text-error-accent border border-error-accent/30 hover:bg-error-bg',
}

const sizes: Record<Size, string> = {
  md: 'h-11 px-4 text-sm min-w-[44px]',
  sm: 'h-9 px-3 text-sm min-w-[36px]',
  icon: 'h-11 w-11 min-w-[44px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, children, leftIcon, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  )
})

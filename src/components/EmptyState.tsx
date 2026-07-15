import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Editorial empty state — quiet, tertiary text. No illustration SVGs. */
export function EmptyState({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'page-px py-10 text-text-tertiary text-sm text-center',
        className,
      )}
    >
      {children}
    </div>
  )
}

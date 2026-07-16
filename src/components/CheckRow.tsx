import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { CheckCircle } from './CheckCircle'
import { useTranslation } from 'react-i18next'

/** Uniform checkable row for routines + tasks on Today (PLAN.md §6.1).
 * - 56px tall, full-width tap target
 * - Tap the body → opens detail (via onOpen)
 * - Tap the leading circle → completion action (via onToggle)
 * - Trailing slot for frequency labels (routines) or "added by" (tasks)
 */
export interface CheckRowProps {
  checked: boolean
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onToggle?: () => void
  onOpen?: () => void
  /** When true, draw the body strikethrough (done state fade-in 150ms). */
  dimmed?: boolean
}

export function CheckRow({
  checked,
  title,
  subtitle,
  trailing,
  onToggle,
  onOpen,
  dimmed,
}: CheckRowProps) {
  const { t } = useTranslation()
  return (
    <li className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-stretch min-h-[56px]">
        <button
          type="button"
          onClick={onToggle}
          disabled={!onToggle}
          aria-pressed={checked}
          aria-label={t(checked ? 'today.markNotDone' : 'today.markDone')}
          className="flex items-center justify-center w-12 shrink-0 enabled:active:scale-[0.92] transition-transform duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-l-xs"
        >
          <CheckCircle checked={checked} />
        </button>

        <div
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) return
            onOpen?.()
          }}
          onKeyDown={(event) => {
            if (!onOpen || (event.key !== 'Enter' && event.key !== ' ')) return
            event.preventDefault()
            onOpen()
          }}
          className={cn(
            'min-w-0 flex-1 flex items-center text-left pr-3 py-3 active:bg-surface-hover transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
            onOpen && 'cursor-pointer',
          )}
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block min-w-0 break-words line-clamp-2 text-[16px] leading-5 text-text-primary',
                'transition-[color,opacity] duration-150 motion-reduce:transition-none',
                checked && 'line-through text-text-tertiary',
                !checked && dimmed && 'text-text-tertiary',
              )}
            >
              {title}
            </span>
            {subtitle && (
              <span className="mt-1 block break-words text-sm text-text-secondary">
                {subtitle}
              </span>
            )}
          </span>
          {trailing && (
            <span className="ml-2 shrink-0 text-right">{trailing}</span>
          )}
        </div>
      </div>
    </li>
  )
}

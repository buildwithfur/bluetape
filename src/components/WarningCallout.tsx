import type { ReactNode } from 'react'
import { Warning } from '@phosphor-icons/react'

/** Quiet printed sticky-note callout for pinned rule reminders on Today.
 * warning-bg / warning-text, no border (DESIGN.md §Warning Callout).
 */
export function WarningCallout({
  children,
  title,
}: {
  children: ReactNode
  title?: ReactNode
}) {
  return (
    <div className="bg-warning-bg text-warning-text rounded-sm px-4 py-3 mx-4">
      <div className="flex gap-3">
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          {title && (
            <div className="label-caps text-warning-text/80 mb-1">{title}</div>
          )}
          <div className="text-sm leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}

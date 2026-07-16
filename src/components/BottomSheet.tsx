import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

/** Mobile bottom sheet / desktop centered modal.
 * Pure white surface (surface-floating) + the tinted overlay shadow — this
 * is the legitimate "overlay" case per DESIGN.md Elevation & Depth.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label={t('action.close')}
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] md:rounded-md"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className="relative w-full md:max-w-[420px] bg-surface-floating md:rounded-md rounded-t-lg shadow-[0_4px_12px_rgba(10,41,80,0.025)] border border-border-subtle max-h-[90vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {title && (
          <div className="page-px h-14 flex items-center border-b border-border-subtle">
            <span className="text-[16px] font-semibold text-ink">{title}</span>
          </div>
        )}
        <div className="overflow-y-auto page-px py-4 flex-1">{children}</div>
        {footer && (
          <div className="page-px py-3 border-t border-border-subtle flex gap-2 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

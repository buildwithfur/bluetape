import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DotsThreeVertical } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

export function OverflowMenu({
  children,
}: {
  children: (close: () => void) => ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative -mr-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('action.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xs text-ink-700 transition hover:bg-surface-active active:scale-95"
      >
        <DotsThreeVertical size={22} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('action.more')}
          className="absolute right-0 top-full z-40 mt-1 w-44 rounded-sm bg-surface-floating p-1.5 shadow-[0_8px_24px_rgba(10,41,80,0.12)]"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

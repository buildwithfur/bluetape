import { Check } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

/** The 22px check box.
 * Empty square = pending, filled green = done (success-accent appears *only*
 * here per DESIGN.md — never as a tile, banner, or button background).
 */
export function CheckCircle({
  checked,
  className,
  size = 22,
}: {
  checked: boolean
  className?: string
  size?: number
}) {
  return (
    <span
      role="presentation"
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-[6px]',
        'transition-colors duration-150 motion-reduce:transition-none',
        checked
          ? 'bg-success-bg text-success-accent'
          : 'text-transparent ring-[1.5px] ring-inset ring-border-strong',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Check size={16} weight="bold" />
    </span>
  )
}

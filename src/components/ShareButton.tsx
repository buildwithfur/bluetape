import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ShareNetwork } from '@phosphor-icons/react'

export function ShareButton({ path, title }: { path: string; title: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = new URL(path, window.location.origin).toString()
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // Closing the native share sheet is not an error the UI needs to show.
      }
      return
    }
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={copied ? t('action.copied') : t('action.share')}
      title={copied ? t('action.copied') : t('action.share')}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xs text-ink-700 transition hover:bg-surface-active active:scale-95"
    >
      {copied ? <Check size={20} aria-hidden="true" /> : <ShareNetwork size={20} aria-hidden="true" />}
    </button>
  )
}

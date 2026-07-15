import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, UploadSimple, X, Spinner } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import type { Id } from '@convex/_generated/dataModel'

/** Photo capture for the item editor.
 * Convex 3-step upload flow (PLAN.md §1 quickstart): generateUploadUrl →
 * POST the file → save the returned storageId. The editor passes `previewUrl`
 * (resolved from `useStorageUrl`) when editing an existing item.
 */
export function PhotoCapture({
  storageId,
  previewUrl,
  onChange,
  upload,
}: {
  storageId?: Id<'_storage'>
  previewUrl?: string | null
  onChange: (storageId: Id<'_storage'> | undefined) => void | Promise<void>
  upload: () => Promise<string> // returns upload url
}) {
  const { t } = useTranslation()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const src = previewUrl ?? undefined

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const postUrl = await upload()
      const res = await fetch(postUrl, {
        method: 'POST',
        headers: file.type ? { 'Content-Type': file.type } : undefined,
        body: file,
      })
      if (!res.ok) throw new Error(t('page.photo.uploadFailed'))
      const { storageId: sid } = (await res.json()) as { storageId: Id<'_storage'> }
      onChange(sid)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('page.photo.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {src && (
        <div className="relative rounded-md overflow-hidden border border-border-line aspect-[4/3]">
          <img src={src} alt={t('page.photo.alt')} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={t('page.photo.remove')}
            className="absolute top-2 right-2 h-9 w-9 inline-flex items-center justify-center rounded-full bg-surface-floating/90 text-ink-700 backdrop-blur-sm ring-1 ring-border-subtle active:scale-95 transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className={cn('grid grid-cols-2 gap-2', src && 'mt-2')}>
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={busy}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xs border border-border-line px-3 text-sm font-medium text-ink-700 transition hover:bg-surface-hover active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? <Spinner size={20} className="animate-spin" aria-hidden="true" /> : <UploadSimple size={20} aria-hidden="true" />}
          <span>{busy ? t('page.photo.uploading') : t('page.photo.upload')}</span>
        </button>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={busy}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xs border border-border-line px-3 text-sm font-medium text-ink-700 transition hover:bg-surface-hover active:scale-[0.99] disabled:opacity-60"
        >
          <Camera size={20} aria-hidden="true" />
          <span>{t('page.photo.take')}</span>
        </button>
      </div>

      {error && <p className="text-sm text-error-accent mt-1">{error}</p>}
      {storageId && !src && (
        <p className="mono-sm text-text-tertiary mt-1">{t('page.photo.previewLoading')}</p>
      )}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void handleFile(file)
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void handleFile(file)
        }}
      />
    </div>
  )
}

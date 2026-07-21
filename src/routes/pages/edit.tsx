import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { PhotoCapture } from '@/components/PhotoCapture'
import { WikiLinkSuggestions } from '@/components/WikiLinkSuggestions'
import {
  usePageBySlug,
  useSavePage,
  useGenerateUploadUrl,
  useStorageUrl,
} from '@/data/hooks'
import type { PageType } from '@/types'
import type { Id } from '@convex/_generated/dataModel'
import { pagePath } from '@/lib/record-route'

function pageTypeFromQuery(value: string | null): PageType {
  return value === 'rule' ? 'rule' : 'item'
}

/** /p/new and /p/:slug/edit. Reads ?title (broken-link flow) and ?type. */
export default function PageEdit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!slug
  const page = usePageBySlug(slug)
  const savePage = useSavePage()
  const generateUploadUrl = useGenerateUploadUrl()

  const [title, setTitle] = useState(() => searchParams.get('title') ?? '')
  const [content, setContent] = useState('')
  const [type, setType] = useState<PageType>(() => pageTypeFromQuery(searchParams.get('type')))
  const [photoId, setPhotoId] = useState<Id<'_storage'> | undefined>(undefined)
  const [pinnedToToday, setPinnedToToday] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const photoUrl = useStorageUrl(photoId ?? page?.photoId ?? undefined)

  // Hydrate from existing page once.
  if (isEdit && page && !loaded) {
    setTitle(page.title)
    setContent(page.content)
    setType(page.type)
    setPhotoId(page.photoId ?? undefined)
    setPinnedToToday(page.pinnedToToday ?? false)
    setLoaded(true)
  }
  if (isEdit && page === undefined) {
    return (
      <>
        <TopBar title={t('page.newPage')} back />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }
  if (isEdit && page === null) {
    return (
      <>
        <TopBar title={t('page.newPage')} back />
        <EmptyState>{t('common.empty')}</EmptyState>
      </>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(t('page.editor.emptyTitle'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await savePage({
        pageId: isEdit ? page?._id : undefined,
        title: title.trim(),
        type,
        content: type === 'item' ? content.trim() : isEdit ? page?.content ?? '' : '',
        // These legacy fields are no longer authored in the item form. Preserve
        // existing values during edits instead of deleting stored data.
        localName: isEdit && type === 'item' ? page?.localName : undefined,
        location: isEdit && type === 'item' ? page?.location : undefined,
        photoId: type === 'item' ? photoId : undefined,
        pinnedToToday: type === 'rule' ? pinnedToToday : undefined,
      })
      if (!saved) throw new Error(t('common.saveFailed'))
      navigate(pagePath(saved), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <TopBar
        back
        title={isEdit ? t('action.edit') : type === 'rule' ? t('page.newRule') : t('page.newItem')}
        showSearch={false}
        right={
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={busy || !title.trim()}
          >
            {t('action.save')}
          </Button>
        }
      />

      <div className="page-px py-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={type === 'item' ? 'text-[16px] font-medium text-ink' : 'label-caps text-text-tertiary'}>
            {t('page.field.title')}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12 rounded-xs border border-border-line bg-surface px-3 text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </label>

        {type === 'item' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[16px] font-medium text-ink">{t('page.field.content')}</span>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  placeholder={t('page.field.contentPlaceholder')}
                  className="resize-y rounded-xs border border-border-line bg-surface px-3 py-3 text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <WikiLinkSuggestions value={content} onChange={setContent} />
            </div>

            <div>
              <span className="label-caps text-text-tertiary mb-2 block">{t('page.field.photo')}</span>
              <PhotoCapture
                storageId={photoId}
                previewUrl={photoUrl ?? undefined}
                onChange={setPhotoId}
                upload={generateUploadUrl}
              />
            </div>
          </>
        )}

        {type === 'rule' && (
          <label className="flex items-center justify-between h-12">
            <span className="text-[16px] text-text-primary">{t('page.field.pinToToday')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={pinnedToToday}
              onClick={() => setPinnedToToday((v) => !v)}
              className={
                'relative w-12 h-7 rounded-full transition-colors ' +
                (pinnedToToday ? 'bg-accent' : 'bg-border-strong')
              }
            >
              <span
                className={
                  'absolute top-0.5 h-6 w-6 rounded-full bg-surface-floating transition-transform ' +
                  (pinnedToToday ? 'translate-x-5' : 'translate-x-0.5')
                }
              />
            </button>
          </label>
        )}

        {error && <p className="text-sm text-error-accent">{error}</p>}
      </div>
    </form>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  SlidersHorizontal,
  Trash,
  Link as LinkIcon,
} from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/Button'
import { BottomSheet } from '@/components/BottomSheet'
import { ShareButton } from '@/components/ShareButton'
import { OverflowMenu } from '@/components/OverflowMenu'
import { PhotoCapture } from '@/components/PhotoCapture'
import {
  usePageBySlug,
  usePageByRecordId,
  useStorageUrl,
  useDeleteRule,
  useCurrentRole,
  useAllPages,
  useSavePage,
  useGenerateUploadUrl,
} from '@/data/hooks'
import { formatInSG } from '@/lib/date'
import { pagePath } from '@/lib/record-route'
import { wikiAuthoringText } from '@/lib/wiki'
import type { PageType } from '@/types'
import type { Id } from '@convex/_generated/dataModel'

export default function PageView({ recordType }: { recordType?: PageType }) {
  const { t } = useTranslation()
  const { slug, id } = useParams()
  const navigate = useNavigate()
  const pageBySlug = usePageBySlug(recordType ? undefined : slug)
  const pageById = usePageByRecordId(recordType ? id : undefined)
  const resolvedPage = recordType ? pageById : pageBySlug
  const page = resolvedPage && recordType && resolvedPage.type !== recordType
    ? null
    : resolvedPage
  const currentRole = useCurrentRole()
  const allPages = useAllPages()
  const savePage = useSavePage()
  const generateUploadUrl = useGenerateUploadUrl()
  const deleteRule = useDeleteRule()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [, setCopied] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingContent, setEditingContent] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [contentDraft, setContentDraft] = useState('')
  const [saveError, setSaveError] = useState(false)
  const [photoDraft, setPhotoDraft] = useState<Id<'_storage'> | undefined>(undefined)
  const [photoDirty, setPhotoDirty] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const contentInputRef = useRef<HTMLTextAreaElement>(null)
  const displayedPhotoId = photoDirty ? photoDraft : page?.photoId ?? undefined
  const photoUrl = useStorageUrl(displayedPhotoId)

  const authoringContent = page && allPages
    ? wikiAuthoringText(page.content, allPages)
    : page?.content ?? ''

  useEffect(() => {
    if (!editingTitle) setTitleDraft(page?.title ?? '')
  }, [page?.title, editingTitle])

  useEffect(() => {
    if (!editingContent) setContentDraft(authoringContent)
  }, [authoringContent, editingContent])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select()
  }, [editingTitle])

  useEffect(() => {
    if (editingContent) contentInputRef.current?.focus()
  }, [editingContent])

  useEffect(() => {
    if (photoDirty && page?.photoId === photoDraft) setPhotoDirty(false)
  }, [page?.photoId, photoDirty, photoDraft])

  if (page === undefined) {
    return (
      <>
        <TopBar title={t('app.name')} back />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }
  if (page === null) {
    return (
      <>
        <TopBar title={t('app.name')} back />
        <EmptyState>{t('common.empty')}</EmptyState>
      </>
    )
  }

  const isAdmin = currentRole === 'admin' || currentRole === 'owner'
  const isRule = page.type === 'rule'
  const currentPage = page

  async function saveFields(next: {
    title?: string
    content?: string
    photoId?: Id<'_storage'>
    replacePhoto?: boolean
  }) {
    return savePage({
      pageId: currentPage._id,
      title: next.title ?? currentPage.title,
      type: currentPage.type,
      content: next.content ?? currentPage.content,
      localName: currentPage.localName,
      localContent: currentPage.localContent,
      location: currentPage.location,
      photoId: next.replacePhoto ? next.photoId : currentPage.photoId,
      pinnedToToday: currentPage.pinnedToToday,
    })
  }

  async function saveTitle() {
    const title = titleDraft.trim()
    if (!title) {
      setSaveError(true)
      titleInputRef.current?.focus()
      return
    }
    if (title !== currentPage.title) {
      try {
        const saved = await saveFields({ title })
        if (saved) navigate(pagePath(saved), { replace: true })
      } catch {
        setSaveError(true)
        return
      }
    }
    setSaveError(false)
    setEditingTitle(false)
  }

  async function saveContent() {
    const content = contentDraft.trim()
    if (content !== authoringContent.trim()) {
      try {
        await saveFields({ content })
      } catch {
        setSaveError(true)
        return
      }
    }
    setSaveError(false)
    setEditingContent(false)
  }

  async function savePhoto(photoId: Id<'_storage'> | undefined) {
    setPhotoDraft(photoId)
    setPhotoDirty(true)
    setSaveError(false)
    try {
      await saveFields({ photoId, replacePhoto: true })
    } catch {
      setPhotoDirty(false)
      setSaveError(true)
    }
  }

  function copyLink() {
    if (!page) return
    const url = new URL(pagePath(page), window.location.origin).toString()
    void navigator.clipboard?.writeText(url)
    setCopied(true)
  }

  return (
    <>
      <TopBar
        back
        title={t(page.type === 'rule' ? 'record.rule' : 'record.item')}
        showSearch={false}
        right={
          <div className="flex items-center">
            <ShareButton path={pagePath(page)} title={page.title} />
            <OverflowMenu>
              {(close) => (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      copyLink()
                      close()
                    }}
                    className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-text-primary transition hover:bg-surface-hover active:bg-surface-active"
                  >
                    <LinkIcon size={19} aria-hidden="true" />
                    {t('action.copyLink')}
                  </button>
                  {isAdmin && isRule && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close()
                        navigate(`/p/${page.slug}/edit`)
                      }}
                      className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-text-primary transition hover:bg-surface-hover active:bg-surface-active"
                    >
                      <SlidersHorizontal size={19} aria-hidden="true" />
                      {t('page.ruleSettings')}
                    </button>
                  )}
                  {isAdmin && isRule && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close()
                        setConfirmDelete(true)
                      }}
                      className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-error-accent transition hover:bg-error-bg active:bg-error-bg"
                    >
                      <Trash size={19} aria-hidden="true" />
                      {t('action.delete')}
                    </button>
                  )}
                </div>
              )}
            </OverflowMenu>
          </div>
        }
      />

      <article>
        {isRule && page.pinnedToToday && (
          <div className="page-px pt-3">
            <span className="label-caps text-warning-text">⚠ {t('today.ruleReminder')}</span>
          </div>
        )}

        {(isRule || !isAdmin) && photoUrl ? (
          <div className="page-px pt-4">
            <div className="aspect-[4/3] overflow-hidden rounded-md border border-border-line">
              <img
                src={photoUrl}
                alt={page.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        ) : null}

        <header className="page-px pt-4 pb-2">
          {page.location && (
            <div className="mono-sm text-text-tertiary">{page.location}</div>
          )}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveTitle()
                }
                if (event.key === 'Escape') {
                  setTitleDraft(page.title)
                  setSaveError(false)
                  setEditingTitle(false)
                }
              }}
              aria-label={t('page.field.title')}
              className="w-full rounded-xs border border-accent bg-surface px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink outline-none ring-2 ring-accent/20"
            />
          ) : isAdmin ? (
            <h1>
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="w-full rounded-xs px-2 py-1 text-left text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
              >
                {page.title}
              </button>
            </h1>
          ) : (
            <h1 className="px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              {page.title}
            </h1>
          )}
          {page.localName && (
            <div className="mt-2">
              <span className="label-caps text-text-tertiary mr-2">{t('page.brokenLinkLabel')}</span>
              <span
                className="text-ink"
                style={{ fontFamily: 'var(--font-local-script)', fontSize: 24 }}
              >
                {page.localName}
              </span>
            </div>
          )}
          <div className="mono-sm text-text-tertiary mt-2">
            {t('page.updated', { date: formatInSG(page.updatedAt, { day: 'numeric', month: 'short' }) })}
          </div>
        </header>

        <div className="page-px pb-6 pt-3">
          {editingContent ? (
            <textarea
              ref={contentInputRef}
              value={contentDraft}
              onChange={(event) => setContentDraft(event.target.value)}
              onBlur={() => void saveContent()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setContentDraft(authoringContent)
                  setSaveError(false)
                  setEditingContent(false)
                }
              }}
              rows={8}
              aria-label={t('page.field.content')}
              className="min-h-40 w-full resize-y rounded-xs border border-accent bg-surface px-3 py-2 text-[17px] leading-[1.6] text-text-primary outline-none ring-2 ring-accent/20"
            />
          ) : isAdmin ? (
            <div
              role="button"
              tabIndex={0}
              aria-label={t('page.editContent')}
              onClick={(event) => {
                if (!(event.target as Element).closest('a')) setEditingContent(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setEditingContent(true)
              }}
              className="min-h-16 w-full cursor-text rounded-xs px-2 py-2 text-left transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
            >
              {page.content ? (
                <Markdown content={page.content} />
              ) : (
                <span className="text-[17px] text-text-tertiary">{t('page.field.contentPlaceholder')}</span>
              )}
            </div>
          ) : page.content ? (
            <Markdown content={page.content} />
          ) : null}
          {saveError && (
            <p role="alert" className="mt-3 text-sm text-error-accent">
              {t('common.saveFailed')}
            </p>
          )}
        </div>

        {!isRule && isAdmin && (
          <div className="border-t border-border-subtle page-px pb-8 pt-4">
            <span className="label-caps mb-2 block text-text-tertiary">
              {t('page.field.photo')}
            </span>
            <PhotoCapture
              storageId={displayedPhotoId}
              previewUrl={photoUrl ?? undefined}
              onChange={savePhoto}
              upload={generateUploadUrl}
            />
          </div>
        )}

      </article>

      {/* Delete confirmation */}
      <BottomSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('action.delete')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!isAdmin || !isRule) return
                await deleteRule(page._id)
                navigate('/more/rules')
              }}
            >
              {t('action.delete')}
            </Button>
          </>
        }
      >
        {t('common.confirmDeleteRule')}
      </BottomSheet>
    </>
  )
}

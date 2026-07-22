import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { OverflowMenu } from '@/components/OverflowMenu'
import { ShareButton } from '@/components/ShareButton'
import { WikiLinkSuggestions } from '@/components/WikiLinkSuggestions'
import {
  useCurrentRole,
  useDeleteRoutine,
  useAllPages,
  usePageById,
  useRoutine,
  useUpdateRoutineDetails,
} from '@/data/hooks'
import { weekdayName } from '@/lib/date'
import { pagePath, recordPath } from '@/lib/record-route'
import { wikiAuthoringText, wikiPlainText } from '@/lib/wiki'
import { useLocalizedFields } from '@/data/useLocalizedFields'

export default function RoutineView() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const routine = useRoutine(id)
  const allPages = useAllPages()
  const linkedPage = usePageById(routine?.pageId)
  const updateDetails = useUpdateRoutineDetails()
  const deleteRoutine = useDeleteRoutine()
  const role = useCurrentRole()
  const canManage = role === 'admin' || role === 'owner'
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [saveError, setSaveError] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  const authoringTitle = routine && allPages
    ? wikiAuthoringText(routine.title, allPages)
    : routine?.title ?? ''
  const authoringNote = routine && allPages
    ? wikiAuthoringText(routine.description ?? '', allPages)
    : routine?.description ?? ''
  const localized = useLocalizedFields(
    routine
      ? [
          { entityType: 'routine' as const, entityId: routine._id, field: 'title' as const, source: routine.title },
          ...(routine.description ? [{ entityType: 'routine' as const, entityId: routine._id, field: 'description' as const, source: routine.description }] : []),
          ...(linkedPage ? [{ entityType: 'page' as const, entityId: linkedPage._id, field: 'title' as const, source: linkedPage.title }] : []),
        ]
      : [],
  )

  useEffect(() => {
    if (!editingTitle) setTitleDraft(authoringTitle)
  }, [authoringTitle, editingTitle])

  useEffect(() => {
    if (!editingNote) setNoteDraft(authoringNote)
  }, [authoringNote, editingNote])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select()
  }, [editingTitle])

  useEffect(() => {
    if (editingNote) noteInputRef.current?.focus()
  }, [editingNote])

  if (routine === undefined) {
    return (
      <>
        <TopBar title={t('routine.detail')} back showSearch={false} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }
  if (routine === null) {
    return (
      <>
        <TopBar title={t('routine.detail')} back showSearch={false} />
        <EmptyState>{t('common.empty')}</EmptyState>
      </>
    )
  }

  const schedule = routine.frequency === 'daily'
    ? t('routine.daily')
    : routine.frequency === 'weekly'
      ? t('routine.everyWeekday', { day: weekdayName(routine.dayOfWeek ?? 1) })
      : t('routine.nthMonthly', { n: routine.dayOfMonth ?? 1 })
  const routineId = routine._id

  async function saveTitle() {
    const title = titleDraft.trim()
    if (!title) {
      setSaveError(true)
      titleInputRef.current?.focus()
      return
    }
    if (title !== authoringTitle.trim()) {
      try {
        await updateDetails(routineId, { title })
      } catch {
        setSaveError(true)
        return
      }
    }
    setSaveError(false)
    setEditingTitle(false)
  }

  async function saveNote() {
    const description = noteDraft.trim()
    if (description !== authoringNote.trim()) {
      try {
        await updateDetails(routineId, { description })
      } catch {
        setSaveError(true)
        return
      }
    }
    setSaveError(false)
    setEditingNote(false)
  }

  return (
    <>
      <TopBar
        title={t('routine.detail')}
        back
        showSearch={false}
        right={
          <div className="flex items-center">
            <ShareButton path={recordPath('routine', routine._id)} title={wikiPlainText(routine.title)} />
            {canManage && (
              <OverflowMenu>
                {(close) => (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      setDeleteError(false)
                      setConfirmDelete(true)
                    }}
                    className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-error-accent transition hover:bg-error-bg active:bg-error-bg"
                  >
                    <Trash size={19} aria-hidden="true" />
                    {t('action.delete')}
                  </button>
                )}
              </OverflowMenu>
            )}
          </div>
        }
      />
      <article className="page-px py-6">
        <div>
          {editingTitle ? (
            <div>
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
                    setTitleDraft(authoringTitle)
                    setSaveError(false)
                    setEditingTitle(false)
                  }
                }}
                aria-label={t('routine.field.title')}
                className="w-full rounded-xs border border-accent bg-surface px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink outline-none ring-2 ring-accent/20"
              />
              <div className="mt-1">
                <WikiLinkSuggestions value={titleDraft} onChange={setTitleDraft} />
              </div>
            </div>
          ) : canManage ? (
            <h1
              tabIndex={0}
              onClick={(event) => {
                if (!(event.target as Element).closest('a')) setEditingTitle(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !(event.target as Element).closest('a')) {
                  setEditingTitle(true)
                }
              }}
              className="w-full cursor-text rounded-xs px-2 py-1 text-left text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
            >
              <Markdown content={localized.textFor({ entityType: 'routine', entityId: routine._id, field: 'title', source: routine.title })} inline />
            </h1>
          ) : (
            <h1 className="min-w-0 px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <Markdown content={localized.textFor({ entityType: 'routine', entityId: routine._id, field: 'title', source: routine.title })} inline />
            </h1>
          )}
        </div>
        <div className="mono-sm mt-3 text-text-tertiary">{schedule}</div>

        <section className="mt-6 border-t border-border-subtle pt-5">
          <div className="label-caps mb-2 text-text-tertiary">{t('routine.field.description')}</div>
          {editingNote ? (
            <div>
              <textarea
                ref={noteInputRef}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={() => void saveNote()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setNoteDraft(authoringNote)
                    setSaveError(false)
                    setEditingNote(false)
                  }
                }}
                rows={3}
                aria-label={t('routine.field.description')}
                className="w-full resize-none rounded-xs border border-accent bg-surface px-3 py-2 text-[17px] leading-[1.6] text-text-primary outline-none ring-2 ring-accent/20"
              />
              <div className="mt-1">
                <WikiLinkSuggestions value={noteDraft} onChange={setNoteDraft} />
              </div>
            </div>
          ) : canManage ? (
            <div
              tabIndex={0}
              onClick={(event) => {
                if (!(event.target as Element).closest('a')) setEditingNote(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !(event.target as Element).closest('a')) {
                  setEditingNote(true)
                }
              }}
              className="min-h-11 w-full rounded-xs px-2 py-2 text-left text-[17px] leading-[1.6] transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
            >
              {routine.description ? (
                <Markdown content={localized.textFor({ entityType: 'routine', entityId: routine._id, field: 'description', source: routine.description })} />
              ) : (
                <span className="text-text-tertiary">{t('routine.field.descriptionPlaceholder')}</span>
              )}
            </div>
          ) : routine.description ? (
            <Markdown content={localized.textFor({ entityType: 'routine', entityId: routine._id, field: 'description', source: routine.description })} />
          ) : null}
        </section>

        {saveError && (
          <p role="alert" className="mt-3 text-sm text-error-accent">
            {t('common.saveFailed')}
          </p>
        )}

        {linkedPage && (
          <div className="mt-6 border-t border-border-subtle pt-5">
            <div className="label-caps mb-2 text-text-tertiary">{t('routine.field.linkPage')}</div>
            <Link className="wikilink text-[16px]" to={pagePath(linkedPage)}>
              {localized.textFor({ entityType: 'page', entityId: linkedPage._id, field: 'title', source: linkedPage.title })}
            </Link>
          </div>
        )}

      </article>

      <BottomSheet
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false)
          setDeleteError(false)
        }}
        title={t('action.delete')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmDelete(false)
                setDeleteError(false)
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={async () => {
                if (!canManage || deleting) return
                setDeleting(true)
                setDeleteError(false)
                try {
                  await deleteRoutine(routine._id)
                  navigate('/routines', { replace: true })
                } catch {
                  setDeleteError(true)
                } finally {
                  setDeleting(false)
                }
              }}
            >
              {t('action.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>{t('common.confirmDeleteRoutine')}</p>
          {deleteError && (
            <p role="alert" className="text-sm text-error-accent">
              {t('common.deleteRoutineFailed')}
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

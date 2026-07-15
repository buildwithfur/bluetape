import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { ShareButton } from '@/components/ShareButton'
import {
  useCurrentRole,
  useAllPages,
  usePageById,
  useRoutine,
  useUpdateRoutineDetails,
} from '@/data/hooks'
import { weekdayName } from '@/lib/date'
import { pagePath, recordPath } from '@/lib/record-route'
import { wikiAuthoringText, wikiPlainText } from '@/lib/wiki'

export default function RoutineView() {
  const { t } = useTranslation()
  const { id } = useParams()
  const routine = useRoutine(id)
  const allPages = useAllPages()
  const linkedPage = usePageById(routine?.pageId)
  const updateDetails = useUpdateRoutineDetails()
  const role = useCurrentRole()
  const canManage = role === 'admin' || role === 'owner'
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [saveError, setSaveError] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  const authoringTitle = routine && allPages
    ? wikiAuthoringText(routine.title, allPages)
    : routine?.title ?? ''
  const authoringNote = routine && allPages
    ? wikiAuthoringText(routine.description ?? '', allPages)
    : routine?.description ?? ''

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
        right={<ShareButton path={recordPath('routine', routine._id)} title={wikiPlainText(routine.title)} />}
      />
      <article className="page-px py-6">
        <div>
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
                  setTitleDraft(authoringTitle)
                  setSaveError(false)
                  setEditingTitle(false)
                }
              }}
              aria-label={t('routine.field.title')}
              className="w-full rounded-xs border border-accent bg-surface px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink outline-none ring-2 ring-accent/20"
            />
          ) : canManage ? (
            <h1>
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="w-full rounded-xs px-2 py-1 text-left text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
              >
                {wikiPlainText(routine.title)}
              </button>
            </h1>
          ) : (
            <h1 className="min-w-0 px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <Markdown content={routine.title} inline />
            </h1>
          )}
        </div>
        <div className="mono-sm mt-3 text-text-tertiary">{schedule}</div>

        <section className="mt-6 border-t border-border-subtle pt-5">
          <div className="label-caps mb-2 text-text-tertiary">{t('routine.field.description')}</div>
          {editingNote ? (
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
          ) : canManage ? (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="min-h-11 w-full rounded-xs px-2 py-2 text-left text-[17px] leading-[1.6] transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
            >
              {routine.description ? (
                <span className="text-text-primary">{wikiPlainText(routine.description)}</span>
              ) : (
                <span className="text-text-tertiary">{t('routine.field.descriptionPlaceholder')}</span>
              )}
            </button>
          ) : routine.description ? (
            <Markdown content={routine.description} />
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
              {linkedPage.title}
            </Link>
          </div>
        )}

      </article>
    </>
  )
}

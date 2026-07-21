import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { BottomSheet } from '@/components/BottomSheet'
import { CheckCircle } from '@/components/CheckCircle'
import { EmptyState } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { ShareButton } from '@/components/ShareButton'
import { OverflowMenu } from '@/components/OverflowMenu'
import { WikiLinkSuggestions } from '@/components/WikiLinkSuggestions'
import {
  useCurrentRole,
  useCurrentProfile,
  useAllPages,
  useDeleteTask,
  useTask,
  useToggleTaskDone,
  useUpdateTaskDetails,
} from '@/data/hooks'
import { dateLabel, formatInSG } from '@/lib/date'
import { recordPath } from '@/lib/record-route'
import { wikiAuthoringText, wikiPlainText } from '@/lib/wiki'

export default function TaskView() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const task = useTask(id)
  const allPages = useAllPages()
  const toggleDone = useToggleTaskDone()
  const deleteTask = useDeleteTask()
  const updateDetails = useUpdateTaskDetails()
  const role = useCurrentRole()
  const profile = useCurrentProfile()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [saveError, setSaveError] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  const authoringTitle = task && allPages
    ? wikiAuthoringText(task.title, allPages)
    : task?.title ?? ''
  const authoringNote = task && allPages
    ? wikiAuthoringText(task.note ?? '', allPages)
    : task?.note ?? ''

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

  if (task === undefined) {
    return (
      <>
        <TopBar title={t('record.task')} back showSearch={false} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }
  if (task === null) {
    return (
      <>
        <TopBar title={t('record.task')} back showSearch={false} />
        <EmptyState>{t('common.empty')}</EmptyState>
      </>
    )
  }

  const taskId = task._id
  const canEdit = role === 'owner' || role === 'admin'
  const canDelete = canEdit || profile?.userId === task.createdBy

  async function saveTitle() {
    const title = titleDraft.trim()
    if (!title) {
      setSaveError(true)
      titleInputRef.current?.focus()
      return
    }
    if (title !== authoringTitle.trim()) {
      try {
        await updateDetails(taskId, { title })
      } catch {
        setSaveError(true)
        return
      }
    }
    setSaveError(false)
    setEditingTitle(false)
  }

  async function saveNote() {
    const note = noteDraft.trim()
    if (note !== authoringNote.trim()) {
      try {
        await updateDetails(taskId, { note })
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
        title={t('record.task')}
        back
        showSearch={false}
        right={
          <div className="flex items-center">
            <ShareButton path={recordPath('task', task._id)} title={wikiPlainText(task.title)} />
            {canDelete && (
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
      <article className="page-px max-w-full overflow-x-clip py-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => void toggleDone(task._id)}
            aria-pressed={task.status === 'done'}
            aria-label={t(task.status === 'done' ? 'today.markNotDone' : 'today.markDone')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xs transition active:scale-95"
          >
            <CheckCircle checked={task.status === 'done'} size={26} />
          </button>
          {editingTitle ? (
            <div className="min-w-0 flex-1">
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
          ) : canEdit ? (
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
              className="line-clamp-2 min-w-0 flex-1 cursor-text break-words rounded-xs px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
            >
              <Markdown content={task.title} inline />
            </h1>
          ) : (
            <h1 className="line-clamp-2 min-w-0 flex-1 break-words px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <Markdown content={task.title} inline />
            </h1>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-1 mono-sm text-text-tertiary">
          <span>{t('record.created', { date: formatInSG(task.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
          {task.dueDate && (
            <span>{t('record.due', { date: dateLabel(task.dueDate) })}</span>
          )}
        </div>

        <section className="mt-6 border-t border-border-subtle pt-5">
          <div className="label-caps mb-2 text-text-tertiary">{t('record.note')}</div>
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
                aria-label={t('record.note')}
                className="w-full resize-none rounded-xs border border-accent bg-surface px-3 py-2 text-[17px] leading-[1.6] text-text-primary outline-none ring-2 ring-accent/20"
              />
              <div className="mt-1">
                <WikiLinkSuggestions value={noteDraft} onChange={setNoteDraft} />
              </div>
            </div>
          ) : canEdit ? (
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
              className="min-h-11 w-full cursor-text break-words rounded-xs px-2 py-2 text-left text-[17px] leading-[1.6] transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-active"
            >
              {task.note ? (
                <Markdown content={task.note} className="break-words" />
              ) : (
                <span className="text-text-tertiary">{t('record.notePlaceholder')}</span>
              )}
            </div>
          ) : task.note ? (
            <Markdown content={task.note} className="break-words" />
          ) : null}
        </section>

        {saveError && (
          <p role="alert" className="mt-3 text-sm text-error-accent">
            {t('common.saveFailed')}
          </p>
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
                if (!canDelete || deleting) return
                setDeleting(true)
                setDeleteError(false)
                try {
                  await deleteTask(task._id)
                  navigate('/', { replace: true })
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
          <p>{t('common.confirmDeleteTask')}</p>
          {deleteError && (
            <p role="alert" className="text-sm text-error-accent">
              {t('common.deleteTaskFailed')}
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

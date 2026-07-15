import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Plus, X } from '@phosphor-icons/react'
import { useAddTask } from '@/data/hooks'
import { WikiLinkSuggestions } from './WikiLinkSuggestions'
import { TaskDatePicker } from './TaskDatePicker'

export function InlineTaskComposer({ today }: { today: string }) {
  const { t } = useTranslation()
  const addTask = useAddTask()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  function reset() {
    setTitle('')
    setDueDate(today)
    setSaveFailed(false)
    setOpen(false)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    setSaveFailed(false)
    try {
      await addTask(title.trim(), dueDate)
      reset()
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <li className="border-b border-border-subtle">
        <button
          type="button"
          onClick={() => {
            setDueDate(today)
            setOpen(true)
          }}
          className="page-px flex min-h-14 w-full items-center gap-3 text-left text-[16px] text-text-tertiary transition hover:bg-surface-hover active:bg-surface-active"
        >
          <span className="flex h-11 w-11 items-center justify-center text-accent" aria-hidden="true">
            <Plus size={19} weight="bold" />
          </span>
          {t('today.addTask')}
        </button>
      </li>
    )
  }

  return (
    <li className="border-b border-border-subtle bg-surface">
      <form onSubmit={submit} className="page-px py-3">
        <label className="sr-only" htmlFor="inline-task-title">
          {t('today.addTask')}
        </label>
        <input
          id="inline-task-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('today.taskPlaceholder')}
          className="h-11 w-full bg-transparent text-[17px] text-text-primary placeholder:text-text-disabled focus:outline-none"
        />

        <WikiLinkSuggestions value={title} onChange={setTitle} />

        {saveFailed && (
          <p className="mt-2 text-sm text-error-text" role="alert">
            {t('common.saveFailed')}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <TaskDatePicker value={dueDate} onChange={setDueDate} />
          <span className="flex-1" />
          <button
            type="button"
            onClick={reset}
            aria-label={t('action.cancel')}
            className="flex h-10 w-10 items-center justify-center rounded-xs text-text-secondary transition hover:bg-surface-hover active:scale-95"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            aria-label={t('action.add')}
            className="flex h-10 w-10 items-center justify-center rounded-xs bg-accent text-text-on-accent transition hover:bg-accent-hover active:scale-95 disabled:bg-accent-soft disabled:text-text-on-accent"
          >
            <ArrowUp size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </form>
    </li>
  )
}

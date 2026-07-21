import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, CalendarDots, Plus, X } from '@phosphor-icons/react'
import { useSaveRoutine } from '@/data/hooks'
import { weekdayName } from '@/lib/date'
import type { Frequency } from '@/types'
import { cn } from '@/lib/cn'
import { WikiLinkSuggestions } from './WikiLinkSuggestions'

export function InlineRoutineComposer({ frequency }: { frequency: Frequency }) {
  const { t } = useTranslation()
  const saveRoutine = useSaveRoutine()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const sectionLabel = t(`routine.section.${frequency}`)

  function reset() {
    setTitle('')
    setDescription('')
    setDayOfWeek(1)
    setDayOfMonth(1)
    setSaveFailed(false)
    setOpen(false)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    setSaveFailed(false)
    try {
      await saveRoutine({
        title: title.trim(),
        description: description.trim() || undefined,
        frequency,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
        isActive: true,
      })
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
          onClick={() => setOpen(true)}
          className="page-px flex min-h-14 w-full items-center gap-3 text-left text-[16px] text-text-tertiary transition hover:bg-surface-hover active:bg-surface-active"
        >
          <span className="flex h-11 w-11 items-center justify-center text-accent" aria-hidden="true">
            <Plus size={19} weight="bold" />
          </span>
          {t('routine.addToSection', { section: sectionLabel.toLowerCase() })}
        </button>
      </li>
    )
  }

  return (
    <li className="border-b border-border-subtle bg-surface">
      <form onSubmit={submit} className="page-px py-3">
        <label className="sr-only" htmlFor={`routine-title-${frequency}`}>
          {t('routine.field.title')}
        </label>
        <input
          id={`routine-title-${frequency}`}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('routine.field.titlePlaceholder')}
          className="h-11 w-full bg-transparent text-[17px] text-text-primary placeholder:text-text-disabled focus:outline-none"
        />

        <WikiLinkSuggestions value={title} onChange={setTitle} />

        <label className="sr-only" htmlFor={`routine-description-${frequency}`}>
          {t('routine.field.description')}
        </label>
        <input
          id={`routine-description-${frequency}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('routine.field.descriptionPlaceholder')}
          className="h-9 w-full bg-transparent text-[14px] text-text-secondary placeholder:text-text-disabled focus:outline-none"
        />

        <WikiLinkSuggestions value={description} onChange={setDescription} />

        {frequency === 'weekly' && (
          <fieldset className="mt-2">
            <legend className="sr-only">{t('routine.field.dayOfWeek')}</legend>
            <div className="flex justify-between gap-1">
              {Array.from({ length: 7 }, (_, index) => weekdayName(index, 'short')).map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDayOfWeek(index)}
                  aria-pressed={dayOfWeek === index}
                  className={cn(
                    'flex h-9 min-w-9 flex-1 items-center justify-center rounded-xs text-xs font-medium transition-colors',
                    dayOfWeek === index
                      ? 'bg-ink-700 text-text-on-accent'
                      : 'text-text-secondary hover:bg-surface-hover',
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {frequency === 'monthly' && (
          <label className="mt-2 flex items-center gap-3 text-sm text-text-secondary">
            <span>{t('routine.field.dayOfMonth')}</span>
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(event) => setDayOfMonth(Number(event.target.value))}
              className="h-9 w-16 rounded-xs border border-border-line bg-transparent px-2 text-center text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
        )}

        {saveFailed && (
          <p className="mt-2 text-sm text-error-text" role="alert">
            {t('common.saveFailed')}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-xs border border-border-line px-3 text-sm font-medium text-text-secondary">
            <CalendarDots size={18} aria-hidden="true" />
            {sectionLabel}
          </span>
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
            className="flex h-10 w-10 items-center justify-center rounded-xs bg-accent text-text-on-accent transition hover:bg-accent-hover active:scale-95 disabled:bg-accent-soft"
          >
            <ArrowUp size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </form>
    </li>
  )
}

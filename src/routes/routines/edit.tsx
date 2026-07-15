import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { RoleGate } from '@/components/RoleGate'
import {
  useRoutine,
  useSaveRoutine,
  useAllPages,
} from '@/data/hooks'
import type { Frequency } from '@/types'
import { weekdayName } from '@/lib/date'
import { WikiLinkSuggestions } from '@/components/WikiLinkSuggestions'
import { wikiAuthoringText } from '@/lib/wiki'

/** Admin-only routine editor. Handles both new (no id) and edit (:id). */
export default function RoutineEdit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const routine = useRoutine(!isNew ? (id as never) : undefined)
  const allPages = useAllPages()
  const saveRoutine = useSaveRoutine()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('daily')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Hydrate from the existing routine once.
  if (!isNew && routine && allPages && !loaded) {
    setTitle(wikiAuthoringText(routine.title, allPages))
    setDescription(wikiAuthoringText(routine.description ?? '', allPages))
    setFrequency(routine.frequency)
    setDayOfWeek(routine.dayOfWeek ?? 1)
    setDayOfMonth(routine.dayOfMonth ?? 1)
    setLoaded(true)
  }

  if (!isNew && routine === undefined) {
    return (
      <>
        <TopBar title={t('routine.new')} back />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(t('routine.titleRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await saveRoutine({
        routineId: !isNew ? (id as never) : undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        frequency,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
        isActive: isNew ? true : undefined,
      })
      if (saved) navigate(`/routines/${saved._id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <RoleGate allow={['admin']} fallback={<EmptyState>{t('common.empty')}</EmptyState>}>
      <form onSubmit={submit} className="flex flex-col">
        <TopBar title={isNew ? t('routine.new') : title} back />
        <div className="page-px py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('routine.field.title')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 px-3 rounded-xs bg-surface border border-border-line text-text-primary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <WikiLinkSuggestions value={title} onChange={setTitle} />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="label-caps text-text-tertiary">{t('routine.field.description')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="px-3 py-2 rounded-xs bg-surface border border-border-line text-text-primary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <fieldset>
            <legend className="label-caps text-text-tertiary mb-2">{t('routine.field.frequency')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={
                    'h-11 rounded-xs border text-sm transition-colors ' +
                    (frequency === f
                      ? 'border-accent bg-accent-bg text-accent font-medium'
                      : 'border-border-line text-text-secondary hover:bg-surface-hover')
                  }
                >
                  {t(`routine.section.${f}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {frequency === 'weekly' && (
            <fieldset>
              <legend className="label-caps text-text-tertiary mb-2">{t('routine.field.dayOfWeek')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 7 }, (_, i) => weekdayName(i, 'short')).map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDayOfWeek(i)}
                    className={
                      'h-10 w-10 rounded-xs border text-sm transition-colors ' +
                      (dayOfWeek === i
                        ? 'border-accent bg-accent-bg text-accent font-medium'
                        : 'border-border-line text-text-secondary hover:bg-surface-hover')
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {frequency === 'monthly' && (
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('routine.field.dayOfMonth')}</span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="h-12 px-3 rounded-xs bg-surface border border-border-line text-text-primary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 w-24"
              />
            </label>
          )}

          {error && <p className="text-sm text-error-accent">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
              {t('action.save')}
            </Button>
          </div>
        </div>
      </form>
    </RoleGate>
  )
}

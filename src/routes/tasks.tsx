import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CaretDown } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { CheckRow } from '@/components/CheckRow'
import { WarningCallout } from '@/components/WarningCallout'
import { EmptyState } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { InlineTaskComposer } from '@/components/InlineTaskComposer'
import {
  useToday,
  useUpcomingTasks,
  useToggleRoutineCompletion,
  useToggleTaskDone,
} from '@/data/hooks'
import { cn } from '@/lib/cn'
import type { Doc } from '@convex/_generated/dataModel'
import { todayInSG, addDaysISO, dateLabel, weekdayShort, weekdayName } from '@/lib/date'
import type { Frequency } from '@/types'
import { recordPath } from '@/lib/record-route'
import type { TFunction } from 'i18next'

function frequencyLabel(t: TFunction, freq: Frequency, dayOfWeek?: number, dayOfMonth?: number) {
  if (freq === 'daily') return t('routine.daily')
  if (freq === 'weekly') return t('routine.everyWeekday', { day: weekdayName(dayOfWeek ?? 1) })
  return t('routine.nthMonthly', { n: dayOfMonth ?? 1 })
}

function RoutineRow({
  routine,
  done,
  date,
}: {
  routine: Doc<'routines'>
  done: boolean
  date: string
}) {
  const navigate = useNavigate()
  const toggle = useToggleRoutineCompletion()
  const { t } = useTranslation()

  return (
    <CheckRow
      checked={done}
      title={<Markdown content={routine.title} inline />}
      subtitle={
        routine.description ? (
          <span className="block">
            <Markdown content={routine.description} />
          </span>
        ) : undefined
      }
      trailing={
        <span className="mono-sm text-text-tertiary whitespace-nowrap">
          {frequencyLabel(t, routine.frequency, routine.dayOfWeek, routine.dayOfMonth)}
        </span>
      }
      onToggle={() => void toggle(routine._id, date)}
      onOpen={() => navigate(recordPath('routine', routine._id))}
    />
  )
}

/** A single day's checklist (routines + tasks due that day). */
function DaySection({
  heading,
  date,
  data,
  toggleTaskDone,
  footer,
}: {
  heading: string
  date: string
  data: ReturnType<typeof useToday>
  toggleTaskDone: (id: Doc<'tasks'>['_id']) => void
  footer?: ReactNode
}) {
  const navigate = useNavigate()
  if (!data) return null

  // Ad-hoc tasks (no dueDate) belong to today only — for any other day,
  // only show tasks explicitly due on that date.
  const isToday = date === todayInSG()
  const tasks = isToday
    ? data.tasks
    : data.tasks.filter((t) => t.dueDate === date)

  const hasRows = data.routines.length > 0 || tasks.length > 0 || footer
  if (!hasRows) return null

  return (
    <section className="mt-6">
      <h2 className="label-caps text-text-tertiary page-px mb-1">{heading}</h2>
      <ul>
        {data.routines.map((routine) => (
          <RoutineRow
            key={routine._id}
            routine={routine}
            done={routine.isDone}
            date={date}
          />
        ))}
        {tasks.map((task) => (
          <CheckRow
            key={task._id}
            checked={task.status === 'done'}
            title={<Markdown content={task.title} inline />}
            onToggle={() => void toggleTaskDone(task._id)}
            onOpen={() => navigate(recordPath('task', task._id))}
          />
        ))}
        {footer}
      </ul>
    </section>
  )
}

/** Collapsible "Upcoming" list — the next occurrence of each routine
 *  plus future-dated one-off tasks, grouped by date. */
function UpcomingSection({
  heading,
  items,
}: {
  heading: string
  items: NonNullable<ReturnType<typeof useUpcomingTasks>>
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { t } = useTranslation()
  if (items.length === 0) return null

  // Group items by date (already sorted ascending by the query).
  const byDate = new Map<string, NonNullable<ReturnType<typeof useUpcomingTasks>>>()
  for (const it of items) {
    const arr = byDate.get(it.date) ?? []
    arr.push(it)
    byDate.set(it.date, arr)
  }
  const dates = [...byDate.keys()].sort()

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between page-px py-2"
      >
        <span className="label-caps text-text-tertiary">{heading}</span>
        <span className="flex items-center gap-2">
          <span className="mono-sm text-text-tertiary">{items.length}</span>
          <CaretDown
            size={16}
            weight="bold"
            className={cn(
              'text-text-tertiary transition-transform duration-150 motion-reduce:transition-none',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </span>
      </button>
      {open && (
        <ul className="border-t border-border-subtle">
          {dates.map((d) => {
            const dayItems = byDate.get(d)!
            return (
              <li
                key={d}
                className="border-b border-border-subtle last:border-b-0"
              >
                <div className="page-px pt-3 pb-1">
                  <span className="mono-sm text-text-tertiary">{dateLabel(d)}</span>
                </div>
                <ul>
                  {dayItems.map((it) => (
                    <li
                      key={it.kind === 'routine' ? it.routineId : it.taskId}
                      className="min-h-[44px]"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('a')) return
                          navigate(
                            it.kind === 'routine'
                              ? recordPath('routine', it.routineId)
                              : recordPath('task', it.taskId),
                          )
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          navigate(
                            it.kind === 'routine'
                              ? recordPath('routine', it.routineId)
                              : recordPath('task', it.taskId),
                          )
                        }}
                        className="page-px py-2.5 min-h-[44px] flex cursor-pointer items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <span className="min-w-0 truncate text-[15px] text-text-primary">
                          <Markdown content={it.title} inline />
                        </span>
                        {it.kind === 'routine' && (
                          <span className="mono-sm text-text-tertiary whitespace-nowrap">
                            {frequencyLabel(t, it.frequency, it.dayOfWeek, it.dayOfMonth)}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function Tasks() {
  const { t } = useTranslation()
  const today = todayInSG()
  const tomorrow = addDaysISO(today, 1)
  const todayData = useToday(today, true)
  const tomorrowData = useToday(tomorrow)
  const upcoming = useUpcomingTasks(tomorrow)
  const toggleTaskDone = useToggleTaskDone()

  if (!todayData) {
    return (
      <>
        <TopBar dateLabel back={false} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }

  return (
    <>
      <TopBar dateLabel back={false} />

      {todayData.pinnedRules.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {todayData.pinnedRules.map((rule) => (
            <WarningCallout key={rule._id} title={t('today.ruleReminder')}>
              <Markdown content={rule.content} />
            </WarningCallout>
          ))}
        </div>
      )}

      <DaySection
        heading={t('today.today')}
        date={today}
        data={todayData}
        toggleTaskDone={toggleTaskDone}
        footer={<InlineTaskComposer today={today} />}
      />
      <DaySection
        heading={`${t('today.tomorrow')} · ${weekdayShort(tomorrow)}`}
        date={tomorrow}
        data={tomorrowData}
        toggleTaskDone={toggleTaskDone}
      />

      <UpcomingSection heading={t('today.upcoming')} items={upcoming ?? []} />

    </>
  )
}

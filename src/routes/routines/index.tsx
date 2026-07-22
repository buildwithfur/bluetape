import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { InlineRoutineComposer } from '@/components/InlineRoutineComposer'
import { useRoutines, useCurrentRole } from '@/data/hooks'
import { WEEKDAYS_MONDAY_FIRST, weekdayName } from '@/lib/date'
import type { Frequency } from '@/types'
import { Markdown } from '@/components/Markdown'
import { recordPath } from '@/lib/record-route'

const GROUPS: Frequency[] = ['daily', 'weekly', 'monthly']

export default function RoutinesIndex() {
  const { t } = useTranslation()
  const routines = useRoutines()
  const role = useCurrentRole()
  const navigate = useNavigate()
  const canManage = role === 'admin' || role === 'owner'

  if (!routines || !role) {
    return (
      <>
        <TopBar title={t('nav.routines')} back backOnDesktop={false} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }

  const grouped = GROUPS.map((g) => ({
    group: g,
    items: routines.filter((r) => r.frequency === g),
  }))

  const routineRow = (r: (typeof routines)[number], showSchedule = true) => (
    <li
      key={r._id}
      className="border-b border-border-subtle last:border-b-0"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) return
          navigate(recordPath('routine', r._id))
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          navigate(recordPath('routine', r._id))
        }}
        className="block min-h-[56px] page-px py-3 active:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div
              className={
                'text-[16px] truncate ' +
                (r.isActive ? 'text-text-primary' : 'text-text-tertiary line-through')
              }
            >
              <Markdown content={r.title} inline />
            </div>
            {showSchedule && r.frequency === 'monthly' && (
              <div className="mono-sm text-text-tertiary mt-0.5">
                {t('routine.monthlyOnDay', { day: r.dayOfMonth ?? 1 })}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  )

  return (
    <>
      <TopBar title={t('nav.routines')} back backOnDesktop={false} />

      {grouped.map(({ group, items }, groupIndex) => (
          <section key={group} className={groupIndex === 0 ? 'mt-6' : 'mt-8'}>
            <h2 className="label-caps text-text-tertiary page-px py-2">
              {t(`routine.section.${group}`)}
            </h2>
            <ul className="border-t border-border-subtle">
              {group === 'weekly'
                ? WEEKDAYS_MONDAY_FIRST.map((dayOfWeek) => {
                    const dayItems = items.filter(
                      (routine) => (routine.dayOfWeek ?? 1) === dayOfWeek,
                    )
                    if (dayItems.length === 0) return null
                    return (
                      <li key={dayOfWeek} className="border-b border-border-subtle last:border-b-0">
                        <div className="page-px pt-3 pb-1.5">
                          <span className="text-[15px] font-semibold text-accent">
                            {weekdayName(dayOfWeek, 'long')}
                          </span>
                        </div>
                        <ul>{dayItems.map((routine) => routineRow(routine, false))}</ul>
                      </li>
                    )
                  })
                : items.map((routine) => routineRow(routine))}
              {canManage && <InlineRoutineComposer frequency={group} />}
              {!canManage && items.length === 0 && (
                <li className="page-px flex min-h-14 items-center border-b border-border-subtle text-sm text-text-tertiary">
                  {t('routine.emptySection')}
                </li>
              )}
            </ul>
          </section>
      ))}

      {/* Upcoming moved to the Tasks view. */}

    </>
  )
}

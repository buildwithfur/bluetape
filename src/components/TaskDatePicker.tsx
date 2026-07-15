import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarBlank,
  CalendarDots,
  CaretLeft,
  CaretRight,
  SunHorizon,
} from '@phosphor-icons/react'
import { addDaysISO, dateLabel, todayInSG } from '@/lib/date'
import { cn } from '@/lib/cn'

function isoParts(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

function monthISO(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7)
}

function quickDates(today: string) {
  const todayDate = new Date(`${today}T00:00:00Z`)
  const weekday = todayDate.getUTCDay()
  const saturdayOffset = (6 - weekday + 7) % 7
  const nextMondayOffset = ((8 - weekday) % 7) || 7
  return {
    today,
    tomorrow: addDaysISO(today, 1),
    weekend: addDaysISO(today, saturdayOffset),
    nextWeek: addDaysISO(today, nextMondayOffset),
  }
}

export function TaskDatePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t, i18n } = useTranslation()
  const today = todayInSG()
  const dates = quickDates(today)
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(value.slice(0, 7))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setVisibleMonth(value.slice(0, 7))
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, value])

  const calendar = useMemo(() => {
    const { year, month } = isoParts(`${visibleMonth}-01`)
    const firstDay = new Date(Date.UTC(year, month - 1, 1))
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const leadingBlanks = (firstDay.getUTCDay() + 6) % 7
    return {
      year,
      month,
      leadingBlanks,
      days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    }
  }, [visibleMonth])

  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en'
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(calendar.year, calendar.month - 1, 1)))
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, index + 1)),
    ),
  )
  const buttonLabel = value === dates.today
    ? t('today.today')
    : value === dates.tomorrow
      ? t('today.tomorrow')
      : dateLabel(value)

  function select(date: string) {
    onChange(date)
    setOpen(false)
  }

  function moveMonth(offset: number) {
    const { year, month } = calendar
    setVisibleMonth(monthISO(year, month - 1 + offset))
  }

  const quickOptions = [
    { label: t('today.today'), date: dates.today, icon: CalendarBlank },
    { label: t('today.tomorrow'), date: dates.tomorrow, icon: SunHorizon },
    { label: t('today.thisWeekend'), date: dates.weekend, icon: CalendarDots },
    { label: t('today.nextWeek'), date: dates.nextWeek, icon: CalendarDots },
  ]

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-xs border px-3 text-sm font-medium',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
          open
            ? 'border-accent bg-accent-bg text-ink-700'
            : 'border-border-line text-text-secondary hover:bg-surface-hover',
        )}
      >
        <CalendarBlank size={18} aria-hidden="true" />
        {buttonLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('today.dueDate')}
          className="absolute bottom-full left-0 z-30 mb-2 max-h-[min(560px,calc(100dvh-120px))] w-[min(320px,calc(100vw-44px))] overflow-y-auto rounded-sm bg-surface-floating shadow-[0_8px_24px_rgba(10,41,80,0.12)]"
        >
          <div className="border-b border-border-subtle py-2">
            {quickOptions.map(({ label, date, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => select(date)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surface-hover',
                  value === date && 'bg-accent-bg',
                )}
              >
                <Icon
                  size={19}
                  className={value === date ? 'text-accent' : 'text-ink-700'}
                  aria-hidden="true"
                />
                <span className="flex-1 text-[15px] font-medium text-text-primary">{label}</span>
                <span className="mono-sm text-text-tertiary">{dateLabel(date)}</span>
              </button>
            ))}
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-ink">{monthLabel}</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label={t('today.previousMonth')}
                  className="flex h-9 w-9 items-center justify-center rounded-xs text-text-secondary hover:bg-surface-hover"
                >
                  <CaretLeft size={17} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label={t('today.nextMonth')}
                  className="flex h-9 w-9 items-center justify-center rounded-xs text-text-secondary hover:bg-surface-hover"
                >
                  <CaretRight size={17} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center">
              {weekdayLabels.map((label, index) => (
                <span key={`${label}-${index}`} className="mono-sm py-1 text-text-tertiary">
                  {label}
                </span>
              ))}
              {Array.from({ length: calendar.leadingBlanks }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {calendar.days.map((day) => {
                const date = `${visibleMonth}-${String(day).padStart(2, '0')}`
                const selected = date === value
                const isToday = date === today
                const disabled = date < today
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={disabled}
                    onClick={() => select(date)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={selected}
                    className={cn(
                      'mx-auto my-0.5 flex h-9 w-9 items-center justify-center rounded-xs text-sm transition-colors',
                      disabled && 'text-text-disabled',
                      !disabled && !selected && 'text-text-primary hover:bg-surface-hover',
                      isToday && !selected && 'font-semibold text-accent',
                      selected && 'bg-ink-700 font-semibold text-text-on-accent',
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

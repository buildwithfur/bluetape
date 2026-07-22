/** Time + timezone helpers.

 Per PLAN.md §4: the reference timezone is Asia/Singapore. "Today" is
 computed on the client in SG and sent to Convex as YYYY-MM-DD. Instants are
 stored as Unix timestamps (ms, UTC) and formatted back to SG for display.
*/

import i18n from '@/i18n'

export const SG_TZ = 'Asia/Singapore'

/** Calendar weekday values in the order used by household schedules. */
export const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const

/** Format an instant (ms UTC) as an SG local string. */
export function formatInSG(
  instantMs: number,
  opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  return new Intl.DateTimeFormat(currentLocale(), { ...opts, timeZone: SG_TZ }).format(
    new Date(instantMs),
  )
}

/** Compact "Tue · 7 Jul" label for the top bar. */
export function todayLabel(date = new Date()): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: SG_TZ,
  }).format(inSGDate(date))
}

/** Compute "today" in Asia/Singapore as a YYYY-MM-DD string. */
export function todayInSG(now: Date = new Date()): string {
  // Force the wall-clock parts through the SG timezone.
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: SG_TZ,
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '2025'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

/** Build a Date that, when formatted in SG, yields the same calendar day. */
function inSGDate(now: Date): Date {
  // We need the SG-local Y/M/D/H parts; easiest is to read the parts and
  // construct a UTC Date that *represents* SG wall time (offset isn't applied
  // because we only use the formatted output, never the epoch value).
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SG_TZ,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  return new Date(
    Date.UTC(
      Number(get('year')),
      Number(get('month')) - 1,
      Number(get('day')),
      Number(get('hour')),
      Number(get('minute')),
    ),
  )
}

/** Relative day verbose for routine frequency labels: "1st · monthly" etc. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Add N days to a YYYY-MM-DD string, returning a YYYY-MM-DD string.
 * Computed on the calendar (no timezone drift) — used to derive
 * "tomorrow" from today's SG date. */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** A short weekday label for a YYYY-MM-DD date, e.g. "Wed". */
export function weekdayShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return weekdayName(d.getUTCDay(), 'short')
}

/** A short human label for a YYYY-MM-DD date, e.g. "Wed · 9 Jul".
 * Computed on the calendar (no timezone drift). */
export function dateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const wd = weekdayName(d.getUTCDay(), 'short')
  const day = d.getUTCDate()
  const month = new Intl.DateTimeFormat(currentLocale(), { month: 'short', timeZone: 'UTC' }).format(d)
  return `${wd} · ${day} ${month}`
}

export function weekdayName(
  day: number,
  width: 'long' | 'short' | 'narrow' = 'short',
): string {
  const sunday = new Date(Date.UTC(2021, 7, 1 + day))
  return new Intl.DateTimeFormat(currentLocale(), {
    weekday: width,
    timeZone: 'UTC',
  }).format(sunday)
}

function currentLocale(): string {
  return i18n.resolvedLanguage ?? i18n.language ?? 'en'
}

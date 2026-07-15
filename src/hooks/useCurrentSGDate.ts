import { useEffect, useState } from 'react'
import { todayInSG } from '@/lib/date'

/** Keeps date-scoped subscriptions correct when the app remains open overnight. */
export function useCurrentSGDate(): string {
  const [date, setDate] = useState(() => todayInSG())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDate((current) => {
        const next = todayInSG()
        return next === current ? current : next
      })
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  return date
}

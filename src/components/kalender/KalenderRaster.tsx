import { useMemo } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
} from 'date-fns'

import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { cn } from '@/lib/utils'
import type { Reservierung } from '@/types'

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

interface KalenderRasterProps {
  currentDate: Date
  reservierungen: Reservierung[]
  onDayClick: (dateStr: string) => void
}

export function KalenderRaster({ currentDate, reservierungen, onDayClick }: KalenderRasterProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentDate])

  const reservationMap = useMemo(() => {
    const map: Record<string, Fahrer[]> = {}
    for (const r of reservierungen) {
      const key = r.datum
      if (!map[key]) map[key] = []
      map[key].push(r.fahrer)
    }
    return map
  }, [reservierungen])

  return (
    <div className="space-y-4">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WOCHENTAGE.map(day => (
          <div key={day} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)
          const fahrerOnDay = reservationMap[dateStr] ?? []

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={cn(
                'relative flex min-h-[60px] flex-col items-center gap-1 rounded-md border p-1.5 text-sm transition-colors',
                inMonth
                  ? 'border-border bg-card hover:bg-muted'
                  : 'border-transparent bg-transparent text-muted-foreground/40',
                today && 'ring-2 ring-accent',
              )}
            >
              <span className={cn('text-xs font-medium', today && 'text-accent')}>
                {format(day, 'd')}
              </span>
              {fahrerOnDay.length > 0 && (
                <div className="flex gap-0.5">
                  {fahrerOnDay.map(f => (
                    <span
                      key={f}
                      className={cn('h-2 w-2 rounded-full', FAHRER_FARBEN[f])}
                      title={FAHRER_LABELS[f]}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
        {FAHRER.map(f => (
          <div key={f} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', FAHRER_FARBEN[f])} />
            {FAHRER_LABELS[f]}
          </div>
        ))}
      </div>
    </div>
  )
}

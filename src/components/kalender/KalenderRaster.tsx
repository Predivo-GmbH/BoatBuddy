import { useMemo } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday, getDay,
} from 'date-fns'

import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN } from '@/lib/fahrer'
import { getFeiertageMap } from '@/lib/feiertage'
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

  const calYear = currentDate.getFullYear()

  const feiertageMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const [k, v] of getFeiertageMap(calYear - 1)) map.set(k, v)
    for (const [k, v] of getFeiertageMap(calYear + 1)) map.set(k, v)
    for (const [k, v] of getFeiertageMap(calYear)) map.set(k, v)
    return map
  }, [calYear])

  const reservationMap = useMemo(() => {
    const map: Record<string, Reservierung[]> = {}
    for (const r of reservierungen) {
      const key = r.datum
      if (!map[key]) map[key] = []
      map[key].push(r)
    }
    return map
  }, [reservierungen])

  return (
    <div className="space-y-4">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WOCHENTAGE.map((day, i) => (
          <div
            key={day}
            className={cn(
              'py-2 text-center text-xs font-semibold uppercase tracking-wider',
              i >= 5 ? 'text-accent/70' : 'text-muted-foreground',
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)
          const dayOfWeek = getDay(day) // 0=Sun, 6=Sat
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
          const reservationsOnDay = reservationMap[dateStr] ?? []
          const feiertag = feiertageMap.get(dateStr)

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={cn(
                'stagger-child relative flex min-h-[56px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left text-sm transition-all sm:min-h-[80px] sm:p-2',
                // Base styles
                inMonth
                  ? 'border-border hover:border-accent/40 hover:shadow-sm'
                  : 'border-transparent opacity-30',
                // Holiday tint (subtle red/rose)
                inMonth && feiertag && !today && 'bg-rose-50 dark:bg-rose-950/20',
                // Weekend tint
                inMonth && isWeekend && !feiertag && 'bg-muted/40',
                // Normal in-month
                inMonth && !isWeekend && !feiertag && 'bg-card',
                // Today highlight
                today && 'ring-2 ring-accent ring-offset-1 ring-offset-card bg-accent/5',
              )}
              style={{ animationDelay: `${(index % 7) * 20}ms` }}
            >
              {/* Day number */}
              <span
                className={cn(
                  'text-xs font-medium leading-none',
                  today && 'rounded-full bg-accent px-1.5 py-0.5 text-white',
                  !today && inMonth && 'text-foreground',
                  !today && !inMonth && 'text-muted-foreground',
                )}
              >
                {format(day, 'd')}
              </span>

              {/* Holiday label */}
              {feiertag && inMonth && (
                <span className="hidden text-[9px] font-medium leading-tight text-rose-500 dark:text-rose-400 sm:block">
                  {feiertag}
                </span>
              )}

              {/* Reservation pills */}
              {reservationsOnDay.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-0.5">
                  {reservationsOnDay.map(r => (
                    <span
                      key={r.id}
                      className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white',
                        FAHRER_FARBEN[r.fahrer],
                      )}
                      title={`${FAHRER_LABELS[r.fahrer]}${r.notiz ? ` — ${r.notiz}` : ''}${!r.ganzer_tag ? ' (Halbtag)' : ''}`}
                    >
                      {(FAHRER_LABELS[r.fahrer]?.charAt(0) ?? '?')}
                      {!r.ganzer_tag && (
                        <span className="ml-0.5 text-white/70">&frac12;</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">Legende:</span>
        {FAHRER.map(f => (
          <div key={f} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white',
                FAHRER_FARBEN[f],
              )}
            >
              {FAHRER_LABELS[f].charAt(0)}
            </span>
            <span className="text-xs text-muted-foreground">{FAHRER_LABELS[f]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

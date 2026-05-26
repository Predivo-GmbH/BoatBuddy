import { useMemo } from 'react'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

export function GastsessionStats() {
  const { sessions } = useGastsessions()

  const stats = useMemo(() => {
    const perFahrer: Record<Fahrer, number> = { roger: 0, dani: 0, jan: 0 }
    let total = 0
    const thisMonth = new Date().toISOString().slice(0, 7)
    let thisMonthCount = 0

    for (const s of sessions) {
      const fahrer = s.bezahlt_an as Fahrer
      if (perFahrer[fahrer] !== undefined) {
        perFahrer[fahrer] += Number(s.betrag)
      }
      total += Number(s.betrag)
      if (s.datum.startsWith(thisMonth)) thisMonthCount++
    }

    return { perFahrer, total, totalSessions: sessions.length, thisMonthCount }
  }, [sessions])

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FAHRER.map(f => (
        <div key={f} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={cn('h-2.5 w-2.5 rounded-full', FAHRER_FARBEN[f])} />
            {FAHRER_LABELS[f]}
          </div>
          <p className="mt-1 text-xl font-bold">{formatCurrency(stats.perFahrer[f])}</p>
          <p className="text-xs text-muted-foreground">
            {sessions.filter(s => s.bezahlt_an === f).length} Sessions
          </p>
        </div>
      ))}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Gesamt</p>
        <p className="mt-1 text-xl font-bold">{formatCurrency(stats.total)}</p>
        <p className="text-xs text-muted-foreground">
          {stats.totalSessions} Sessions ({stats.thisMonthCount} diesen Monat)
        </p>
      </div>
    </div>
  )
}

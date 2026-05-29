import { useMemo } from 'react'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER_LABELS, FAHRER_FARBEN, ALLE_FAHRER, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Users, Wallet } from 'lucide-react'

const FAHRER_CSS_VARS: Record<AlleFahrer, string> = {
  roger: 'var(--color-roger)',
  dani: 'var(--color-dani)',
  pedro: 'var(--color-pedro)',
}

export function GastsessionStats() {
  const { sessions } = useGastsessions()

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear().toString()
    const perFahrer: Record<AlleFahrer, { total: number; season: number; count: number; seasonCount: number }> = {
      roger: { total: 0, season: 0, count: 0, seasonCount: 0 },
      dani: { total: 0, season: 0, count: 0, seasonCount: 0 },
      pedro: { total: 0, season: 0, count: 0, seasonCount: 0 },
    }
    let total = 0
    let seasonTotal = 0
    let seasonCount = 0

    for (const s of sessions) {
      const fahrer = s.bezahlt_an as AlleFahrer
      const betrag = Number(s.betrag)
      const isSeason = s.datum.startsWith(currentYear)

      if (perFahrer[fahrer] !== undefined) {
        perFahrer[fahrer].total += betrag
        perFahrer[fahrer].count++
        if (isSeason) {
          perFahrer[fahrer].season += betrag
          perFahrer[fahrer].seasonCount++
        }
      }
      total += betrag
      if (isSeason) {
        seasonTotal += betrag
        seasonCount++
      }
    }

    return { perFahrer, total, seasonTotal, totalSessions: sessions.length, seasonCount }
  }, [sessions])

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 slide-up-stagger">
      {ALLE_FAHRER.filter(f => stats.perFahrer[f].count > 0).map(f => (
        <div
          key={f}
          className="card-premium card-glow card-accent-top rounded-xl border border-border bg-card p-4"
          style={{ '--tw-accent-top-color': FAHRER_CSS_VARS[f] } as React.CSSProperties}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', FAHRER_FARBEN[f])} />
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                {FAHRER_LABELS[f]}
              </p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 icon-bounce">
              <Wallet className="h-4 w-4 text-accent" />
            </div>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold tabular-nums text-foreground break-words">
            {formatCurrency(stats.perFahrer[f].total)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stats.perFahrer[f].count} Sessions gesamt
          </p>
          {stats.perFahrer[f].seasonCount > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saison: {formatCurrency(stats.perFahrer[f].season)} ({stats.perFahrer[f].seasonCount})
            </p>
          )}
        </div>
      ))}

      <div className="card-premium card-glow card-accent-top card-gradient-blue rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
            Gesamt
          </p>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
            <Users className="h-4 w-4 text-accent" />
          </div>
        </div>
        <p className="mt-2 text-xl sm:text-2xl font-bold tabular-nums text-foreground break-words">
          {formatCurrency(stats.total)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {stats.totalSessions} Sessions gesamt
        </p>
        {stats.seasonCount > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Saison {new Date().getFullYear()}: {formatCurrency(stats.seasonTotal)} ({stats.seasonCount})
          </p>
        )}
      </div>
    </div>
  )
}

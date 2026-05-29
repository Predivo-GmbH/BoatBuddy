import { useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BootStatsKarte } from '@/components/nutzung/BootStatsKarte'
import { NutzungslogForm } from '@/components/nutzung/NutzungslogForm'
import { NutzungslogTabelle } from '@/components/nutzung/NutzungslogTabelle'
import { PageSkeleton } from '@/components/shared/PageSkeleton'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { useAusgaben } from '@/hooks/useAusgaben'
import { FAHRER_LABELS, FAHRER_FARBEN, ALLE_FAHRER, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Clock, Fuel, Navigation, TrendingUp } from 'lucide-react'

export default function NutzungslogPage() {
  const { logs, isLoading } = useNutzungslogs()
  const { ausgaben, isLoading: ausgabenLoading } = useAusgaben()

  const currentYear = new Date().getFullYear()

  const fuelAusgaben = useMemo(() =>
    ausgaben.filter(a => a.kategorie === 'treibstoff'),
    [ausgaben]
  )

  const { seasonStats, allTimeStats } = useMemo(() => {
    const yearStr = currentYear.toString()
    const seasonLogs = logs.filter(l => l.datum.startsWith(yearStr))

    let sHours = 0
    for (const log of seasonLogs) {
      sHours += Number(log.betriebsstunden)
    }
    const sTrips = seasonLogs.length
    const sAvgHours = sTrips > 0 ? sHours / sTrips : 0

    const sFuelCost = fuelAusgaben
      .filter(a => a.datum.startsWith(yearStr))
      .reduce((sum, a) => sum + Number(a.betrag), 0)
    const sFuelCount = fuelAusgaben.filter(a => a.datum.startsWith(yearStr)).length

    let aHours = 0
    for (const log of logs) {
      aHours += Number(log.betriebsstunden)
    }
    const aTrips = logs.length

    const aFuelCost = fuelAusgaben.reduce((sum, a) => sum + Number(a.betrag), 0)
    const aFuelCount = fuelAusgaben.length
    const aFuelPerHour = aHours > 0 ? aFuelCost / aHours : 0

    return {
      seasonStats: { totalHours: sHours, fuelCost: sFuelCost, fuelCount: sFuelCount, trips: sTrips, avgHours: sAvgHours },
      allTimeStats: { totalHours: aHours, fuelCost: aFuelCost, fuelCount: aFuelCount, trips: aTrips, fuelPerHour: aFuelPerHour },
    }
  }, [logs, fuelAusgaben, currentYear])

  const { fuelPerFahrer, fuelTotal } = useMemo(() => {
    const map: Partial<Record<AlleFahrer, number>> = {}
    for (const a of fuelAusgaben) {
      const f = (a.bezahlt_von ?? 'bootskasse') as AlleFahrer
      if (ALLE_FAHRER.includes(f as typeof ALLE_FAHRER[number])) {
        map[f] = (map[f] ?? 0) + Number(a.betrag)
      }
    }
    const entries = ALLE_FAHRER
      .filter(f => (map[f] ?? 0) > 0)
      .map(f => ({ fahrer: f, amount: map[f]! }))
      .sort((a, b) => b.amount - a.amount)
    return { fuelPerFahrer: entries, fuelTotal: entries.reduce((s, x) => s + x.amount, 0) }
  }, [fuelAusgaben])

  if (isLoading || ausgabenLoading) {
    return (
      <div>
        <PageHeader title="Nutzungslog" subtitle="Fahrten, Stunden & Treibstoff" />
        <PageSkeleton cards={4} table />
      </div>
    )
  }

  return (
    <div className="section-fade-in">
      <PageHeader
        title="Nutzungslog"
        subtitle="Fahrten, Stunden & Treibstoff"
      />
      <div className="space-y-6">

        {/* Season stats */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Saison {currentYear}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`Stunden ${currentYear}`}
              value={`${seasonStats.totalHours.toFixed(1)}h`}
              subtitle="Betriebsstunden diese Saison"
              icon={Clock}
            />
            <StatCard
              label="Treibstoff"
              value={formatCurrency(seasonStats.fuelCost)}
              subtitle={`${seasonStats.fuelCount} Tankfüllungen`}
              icon={Fuel}
            />
            <StatCard
              label="Fahrten"
              value={seasonStats.trips.toString()}
              subtitle={`Saison ${currentYear}`}
              icon={Navigation}
            />
            <StatCard
              label="Durchschnitt"
              value={`${seasonStats.avgHours.toFixed(1)}h`}
              subtitle="Stunden pro Fahrt"
              icon={TrendingUp}
            />
          </div>
        </div>

        {/* All-time stats */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Gesamt (Alle Jahre)
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Stunden total"
              value={`${allTimeStats.totalHours.toFixed(1)}h`}
              subtitle="Betriebsstunden gesamt"
              icon={Clock}
              accentColor="border-t-2 border-t-muted"
            />
            <StatCard
              label="Treibstoff total"
              value={formatCurrency(allTimeStats.fuelCost)}
              subtitle={`${allTimeStats.fuelCount} Tankfüllungen`}
              icon={Fuel}
              accentColor="border-t-2 border-t-muted"
            />
            <StatCard
              label="Fahrten total"
              value={allTimeStats.trips.toString()}
              subtitle="Alle Einträge"
              icon={Navigation}
              accentColor="border-t-2 border-t-muted"
            />
            <StatCard
              label="Ø pro Stunde"
              value={formatCurrency(allTimeStats.fuelPerHour)}
              subtitle="Treibstoff pro Betriebsstunde"
              icon={TrendingUp}
              accentColor="border-t-2 border-t-muted"
            />
          </div>
        </div>

        <BootStatsKarte />

        <NutzungslogForm />

        {/* Fuel cost per driver */}
        {fuelPerFahrer.length > 0 && (
          <div className="card-premium rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Treibstoffkosten pro Fahrer
            </h3>
            <div className="space-y-2.5">
              {fuelPerFahrer.map(({ fahrer, amount }) => {
                const pct = fuelTotal > 0 ? (amount / fuelTotal) * 100 : 0
                return (
                  <div key={fahrer} className="flex items-center gap-2 sm:gap-3">
                    <span
                      className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', FAHRER_FARBEN[fahrer])}
                    />
                    <span className="w-12 sm:w-16 text-xs sm:text-sm font-medium text-foreground truncate">
                      {FAHRER_LABELS[fahrer]}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-muted/40 h-2">
                      <div
                        className="h-full rounded-full bg-accent/70 transition-all"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-right text-xs sm:text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(amount)}
                    </span>
                    <span className="w-8 sm:w-10 text-right text-[11px] sm:text-xs tabular-nums text-muted-foreground">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <NutzungslogTabelle />
      </div>
    </div>
  )
}

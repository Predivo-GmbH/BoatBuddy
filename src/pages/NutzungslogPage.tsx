import { useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BootStatsKarte } from '@/components/nutzung/BootStatsKarte'
import { NutzungslogForm } from '@/components/nutzung/NutzungslogForm'
import { NutzungslogTabelle } from '@/components/nutzung/NutzungslogTabelle'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { FAHRER_LABELS, FAHRER_FARBEN, ALLE_FAHRER, type AlleFahrer } from '@/lib/fahrer'
import { cn } from '@/lib/utils'
import { Clock, Fuel, Navigation, TrendingUp, Zap } from 'lucide-react'

export default function NutzungslogPage() {
  const { logs } = useNutzungslogs()

  const currentYear = new Date().getFullYear()

  const { seasonStats, allTimeStats } = useMemo(() => {
    const yearStr = currentYear.toString()
    const seasonLogs = logs.filter(l => l.datum.startsWith(yearStr))

    let sHours = 0, sFuel = 0
    for (const log of seasonLogs) {
      sHours += Number(log.betriebsstunden)
      if (log.treibstoff_liter != null) sFuel += Number(log.treibstoff_liter)
    }
    const sTrips = seasonLogs.length
    const sAvgHours = sTrips > 0 ? sHours / sTrips : 0

    let aHours = 0, aFuel = 0
    for (const log of logs) {
      aHours += Number(log.betriebsstunden)
      if (log.treibstoff_liter != null) aFuel += Number(log.treibstoff_liter)
    }
    const aTrips = logs.length
    const aFuelTrips = logs.filter(l => l.treibstoff_liter != null).length
    const aAvgFuel = aFuelTrips > 0 ? aFuel / aFuelTrips : 0

    return {
      seasonStats: { totalHours: sHours, totalFuel: sFuel, trips: sTrips, avgHours: sAvgHours },
      allTimeStats: { totalHours: aHours, totalFuel: aFuel, trips: aTrips, avgFuel: aAvgFuel },
    }
  }, [logs, currentYear])

  const { fuelPerFahrer, fuelTotal } = useMemo(() => {
    const map: Partial<Record<AlleFahrer, number>> = {}
    for (const log of logs) {
      if (log.treibstoff_liter != null && log.fahrer) {
        const f = log.fahrer as AlleFahrer
        map[f] = (map[f] ?? 0) + Number(log.treibstoff_liter)
      }
    }
    const entries = ALLE_FAHRER
      .filter(f => (map[f] ?? 0) > 0)
      .map(f => ({ fahrer: f, liter: map[f]! }))
      .sort((a, b) => b.liter - a.liter)
    return { fuelPerFahrer: entries, fuelTotal: entries.reduce((s, x) => s + x.liter, 0) }
  }, [logs])

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
              value={`${seasonStats.totalFuel.toFixed(0)}L`}
              subtitle="Liter diese Saison"
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
              value={`${allTimeStats.totalFuel.toFixed(0)}L`}
              subtitle="Liter gesamt"
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
              label="Ø Treibstoff"
              value={`${allTimeStats.avgFuel.toFixed(1)}L`}
              subtitle="Liter pro Fahrt"
              icon={Zap}
              accentColor="border-t-2 border-t-muted"
            />
          </div>
        </div>

        <BootStatsKarte />

        <NutzungslogForm />

        {/* Fuel per driver */}
        {fuelPerFahrer.length > 0 && (
          <div className="card-premium rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Treibstoff pro Fahrer
            </h3>
            <div className="space-y-2.5">
              {fuelPerFahrer.map(({ fahrer, liter }) => {
                const pct = fuelTotal > 0 ? (liter / fuelTotal) * 100 : 0
                return (
                  <div key={fahrer} className="flex items-center gap-3">
                    <span
                      className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', FAHRER_FARBEN[fahrer])}
                    />
                    <span className="w-16 text-sm font-medium text-foreground">
                      {FAHRER_LABELS[fahrer]}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-muted/40 h-2">
                      <div
                        className="h-full rounded-full bg-accent/70 transition-all"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">
                      {liter.toFixed(0)}L
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
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

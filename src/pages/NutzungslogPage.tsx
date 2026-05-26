import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BootStatsKarte } from '@/components/nutzung/BootStatsKarte'
import { NutzungslogForm } from '@/components/nutzung/NutzungslogForm'
import { NutzungslogTabelle } from '@/components/nutzung/NutzungslogTabelle'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, ALLE_FAHRER, type AlleFahrer } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Clock, Fuel, Navigation, TrendingUp, Zap, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Fahrer } from '@/lib/fahrer'

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export default function NutzungslogPage() {
  const { logs, createNutzungslog } = useNutzungslogs()

  // Quick entry state
  const [qDatum, setQDatum] = useState(todayISO())
  const [qFahrer, setQFahrer] = useState<Fahrer>('roger')
  const [qStunden, setQStunden] = useState('')
  const [qLiter, setQLiter] = useState('')

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
    const aAvgFuel = aTrips > 0 ? aFuel / aTrips : 0

    return {
      seasonStats: { totalHours: sHours, totalFuel: sFuel, trips: sTrips, avgHours: sAvgHours },
      allTimeStats: { totalHours: aHours, totalFuel: aFuel, trips: aTrips, avgFuel: aAvgFuel },
    }
  }, [logs, currentYear])

  const fuelPerFahrer = useMemo(() => {
    const map: Partial<Record<AlleFahrer, number>> = {}
    for (const log of logs) {
      if (log.treibstoff_liter != null && log.fahrer) {
        const f = log.fahrer as AlleFahrer
        map[f] = (map[f] ?? 0) + Number(log.treibstoff_liter)
      }
    }
    return ALLE_FAHRER
      .filter(f => (map[f] ?? 0) > 0)
      .map(f => ({ fahrer: f, liter: map[f]! }))
      .sort((a, b) => b.liter - a.liter)
  }, [logs])

  const handleQuickSave = (e: React.FormEvent) => {
    e.preventDefault()
    const stunden = parseFloat(qStunden)
    if (isNaN(stunden) || stunden <= 0) {
      toast.error('Bitte Betriebsstunden angeben')
      return
    }
    const liter = qLiter ? parseFloat(qLiter) : undefined
    createNutzungslog.mutate(
      { datum: qDatum, fahrer: qFahrer, betriebsstunden: stunden, treibstoff_liter: liter, aktivitaeten: [] },
      {
        onSuccess: () => {
          toast.success('Schnelleintrag gespeichert')
          setQStunden('')
          setQLiter('')
          setQDatum(todayISO())
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
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

        {/* Quick entry */}
        <form
          onSubmit={handleQuickSave}
          className="card-premium rounded-xl border border-border bg-card p-5 border-t-2 border-t-accent"
        >
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Schnelleintrag
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[130px] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Datum</label>
              <input
                type="date"
                value={qDatum}
                onChange={e => setQDatum(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Fahrer</label>
              <select
                value={qFahrer}
                onChange={e => setQFahrer(e.target.value as Fahrer)}
                className={inputClass}
              >
                {FAHRER.map(f => (
                  <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Betriebsstunden *</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={qStunden}
                onChange={e => setQStunden(e.target.value)}
                placeholder="z.B. 2.5"
                className={inputClass}
              />
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Treibstoff (L)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={qLiter}
                onChange={e => setQLiter(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
            <div className="flex-shrink-0">
              <button
                type="submit"
                disabled={createNutzungslog.isPending}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {createNutzungslog.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Speichern
              </button>
            </div>
          </div>
        </form>

        <BootStatsKarte />

        {/* Fuel per driver */}
        {fuelPerFahrer.length > 0 && (
          <div className="card-premium rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Treibstoff pro Fahrer
            </h3>
            <div className="space-y-2.5">
              {fuelPerFahrer.map(({ fahrer, liter }) => {
                const total = fuelPerFahrer.reduce((s, x) => s + x.liter, 0)
                const pct = total > 0 ? (liter / total) * 100 : 0
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

        <NutzungslogForm />
        <NutzungslogTabelle />
      </div>
    </div>
  )
}

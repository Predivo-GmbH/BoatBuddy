import { useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BootStatsKarte } from '@/components/nutzung/BootStatsKarte'
import { NutzungslogForm } from '@/components/nutzung/NutzungslogForm'
import { NutzungslogTabelle } from '@/components/nutzung/NutzungslogTabelle'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { Clock, Fuel, Navigation, TrendingUp } from 'lucide-react'

export default function NutzungslogPage() {
  const { logs } = useNutzungslogs()

  const seasonStats = useMemo(() => {
    const currentYear = new Date().getFullYear().toString()
    const seasonLogs = logs.filter(l => l.datum.startsWith(currentYear))

    let totalHours = 0
    let totalFuel = 0
    const trips = seasonLogs.length

    for (const log of seasonLogs) {
      totalHours += Number(log.betriebsstunden)
      if (log.treibstoff_liter != null) {
        totalFuel += Number(log.treibstoff_liter)
      }
    }

    const avgHours = trips > 0 ? totalHours / trips : 0

    return { totalHours, totalFuel, trips, avgHours }
  }, [logs])

  return (
    <div className="section-fade-in">
      <PageHeader
        title="Nutzungslog"
        subtitle="Fahrten, Stunden & Treibstoff"
      />
      <div className="space-y-6">
        {/* Season summary */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={`Stunden ${new Date().getFullYear()}`}
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
            subtitle={`Saison ${new Date().getFullYear()}`}
            icon={Navigation}
          />
          <StatCard
            label="Durchschnitt"
            value={`${seasonStats.avgHours.toFixed(1)}h`}
            subtitle="Stunden pro Fahrt"
            icon={TrendingUp}
          />
        </div>

        <BootStatsKarte />
        <NutzungslogForm />
        <NutzungslogTabelle />
      </div>
    </div>
  )
}

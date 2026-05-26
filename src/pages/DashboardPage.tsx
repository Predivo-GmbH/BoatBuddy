import { useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Wallet, Calendar, Users, Ship } from 'lucide-react'
import { useKontostand } from '@/hooks/useKontostand'
import { useReservierungen } from '@/hooks/useReservierungen'
import { useGastsessions } from '@/hooks/useGastsessions'
import { useBootStats } from '@/hooks/useBootStats'
import { useAusgaben } from '@/hooks/useAusgaben'
import { formatCurrency, formatDate, todayISO } from '@/lib/format'
import { FAHRER_LABELS, FAHRER_FARBEN } from '@/lib/fahrer'
import type { Fahrer } from '@/lib/fahrer'

export default function DashboardPage() {
  const { latestKontostand } = useKontostand()
  const { reservierungen } = useReservierungen()
  const { sessions } = useGastsessions()
  const { stats } = useBootStats()
  const { ausgaben } = useAusgaben()

  const today = todayISO()
  const currentYYYYMM = today.slice(0, 7)

  const nextReservation = useMemo(() => {
    const upcoming = reservierungen.filter((r) => r.datum >= today)
    return upcoming.length > 0 ? upcoming[0] : null
  }, [reservierungen, today])

  const gastSessionsThisMonth = useMemo(() => {
    return sessions.filter((s) => s.datum.startsWith(currentYYYYMM)).length
  }, [sessions, currentYYYYMM])

  const letzteAusgaben = useMemo(() => {
    return ausgaben.slice(0, 5)
  }, [ausgaben])

  const kommendeReservierungen = useMemo(() => {
    return reservierungen.filter((r) => r.datum >= today).slice(0, 5)
  }, [reservierungen, today])

  return (
    <>
      <PageHeader title="Dashboard" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Kontostand"
          value={latestKontostand ? formatCurrency(latestKontostand.betrag) : 'CHF 0.00'}
          icon={Wallet}
        />
        <StatCard
          label="Nachste Reservation"
          value={
            nextReservation
              ? `${FAHRER_LABELS[nextReservation.fahrer]} — ${formatDate(nextReservation.datum)}`
              : '—'
          }
          icon={Calendar}
        />
        <StatCard
          label="Gast-Sessions (Monat)"
          value={String(gastSessionsThisMonth)}
          icon={Users}
        />
        <StatCard
          label="Betriebsstunden"
          value={stats ? `${stats.gesamtstunden} h` : '0 h'}
          icon={Ship}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Letzte Ausgaben */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Letzte Ausgaben</h2>
          {letzteAusgaben.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Ausgaben vorhanden.</p>
          ) : (
            <ul className="space-y-2">
              {letzteAusgaben.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatDate(a.datum)}</span>
                    <span className="text-foreground">{a.bezeichnung}</span>
                  </div>
                  <span className="font-medium text-foreground">{formatCurrency(a.betrag)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Kommende Reservierungen */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Kommende Reservierungen</h2>
          {kommendeReservierungen.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Reservierungen geplant.</p>
          ) : (
            <ul className="space-y-2">
              {kommendeReservierungen.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${FAHRER_FARBEN[r.fahrer as Fahrer]}`} />
                  <span className="text-muted-foreground">{formatDate(r.datum)}</span>
                  <span className="text-foreground">{FAHRER_LABELS[r.fahrer as Fahrer]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}

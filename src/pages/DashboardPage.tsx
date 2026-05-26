import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { AusgabeFormDialog } from '@/components/finanzen/AusgabeFormDialog'
import {
  Wallet,
  Calendar,
  Users,
  Ship,
  Fuel,
  Clock,
  DollarSign,
  Plus,
  CalendarPlus,
  UserPlus,
  ChevronRight,
} from 'lucide-react'
import { useKontostand } from '@/hooks/useKontostand'
import { useReservierungen } from '@/hooks/useReservierungen'
import { useGastsessions } from '@/hooks/useGastsessions'
import { useBootStats } from '@/hooks/useBootStats'
import { useAusgaben } from '@/hooks/useAusgaben'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { formatCurrency, formatDate, formatDateLong, todayISO } from '@/lib/format'
import { FAHRER_LABELS, FAHRER_FARBEN, FAHRER_TEXT_FARBEN } from '@/lib/fahrer'
import type { AlleFahrer } from '@/lib/fahrer'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const { latestKontostand, isLoading: kontoLoading } = useKontostand()
  const { reservierungen, isLoading: resvLoading } = useReservierungen()
  const { sessions, isLoading: sessionsLoading } = useGastsessions()
  const { stats, isLoading: statsLoading } = useBootStats()
  const { ausgaben, isLoading: ausgabenLoading } = useAusgaben()
  const { logs, isLoading: logsLoading } = useNutzungslogs()

  const today = todayISO()
  const currentYear = today.slice(0, 4)

  const nextReservation = useMemo(() => {
    const upcoming = reservierungen.filter((r) => r.datum >= today)
    return upcoming.length > 0 ? upcoming[0] : null
  }, [reservierungen, today])

  const seasonSessions = useMemo(() => {
    return sessions.filter((s) => s.datum.startsWith(currentYear))
  }, [sessions, currentYear])

  const seasonAusgaben = useMemo(() => {
    return ausgaben.filter((a) => a.datum.startsWith(currentYear))
  }, [ausgaben, currentYear])

  const seasonLogs = useMemo(() => {
    return logs.filter((l) => l.datum.startsWith(currentYear))
  }, [logs, currentYear])

  const seasonTotalExpenses = useMemo(() => {
    return seasonAusgaben.reduce((sum, a) => sum + Number(a.betrag), 0)
  }, [seasonAusgaben])

  const seasonTotalHours = useMemo(() => {
    return seasonLogs.reduce((sum, l) => sum + Number(l.betriebsstunden), 0)
  }, [seasonLogs])

  const seasonTotalFuel = useMemo(() => {
    return seasonLogs.reduce((sum, l) => sum + Number(l.treibstoff_liter ?? 0), 0)
  }, [seasonLogs])

  const seasonSessionsTotal = useMemo(() => {
    return seasonSessions.reduce((sum, s) => sum + Number(s.betrag), 0)
  }, [seasonSessions])

  const letzteAusgaben = useMemo(() => {
    return ausgaben.slice(0, 5)
  }, [ausgaben])

  const [showAusgabeForm, setShowAusgabeForm] = useState(false)

  const isLoading = kontoLoading || resvLoading || sessionsLoading || statsLoading || ausgabenLoading || logsLoading

  return (
    <div className="section-fade-in">
      <PageHeader title="Dashboard" subtitle="Alles auf einen Blick" />

      {/* Hero Balance Card */}
      <div
        className="card-premium card-accent-top-success rounded-xl border border-border bg-card p-6 mb-6 stagger-child"
        style={{ '--stagger': 0 } as React.CSSProperties}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Wallet className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Bootkonto</p>
        </div>
        {isLoading ? (
          <div className="h-10 w-48 skeleton-shimmer rounded-lg" />
        ) : (
          <p className="text-4xl font-bold tabular-nums text-foreground">
            {latestKontostand ? formatCurrency(latestKontostand.betrag) : 'CHF 0.00'}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Stand: {latestKontostand ? formatDateLong(latestKontostand.datum) : '--'}
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="stagger-child" style={{ '--stagger': 1 } as React.CSSProperties}>
          <StatCard
            label={`Ausgaben ${currentYear}`}
            value={formatCurrency(seasonTotalExpenses)}
            subtitle={`${seasonAusgaben.length} Posten`}
            icon={DollarSign}
          />
        </div>
        <div className="stagger-child" style={{ '--stagger': 2 } as React.CSSProperties}>
          <StatCard
            label="Nächste Reservierung"
            value={nextReservation ? formatDate(nextReservation.datum) : '--'}
            subtitle={
              nextReservation
                ? FAHRER_LABELS[nextReservation.fahrer as AlleFahrer]
                : 'Keine geplant'
            }
            icon={Calendar}
          />
        </div>
        <div className="stagger-child" style={{ '--stagger': 3 } as React.CSSProperties}>
          <StatCard
            label={`Gast-Sessions ${currentYear}`}
            value={String(seasonSessions.length)}
            subtitle={`${formatCurrency(seasonSessionsTotal)} Einnahmen`}
            icon={Users}
          />
        </div>
        <div className="stagger-child" style={{ '--stagger': 4 } as React.CSSProperties}>
          <StatCard
            label="Betriebsstunden"
            value={stats ? `${Number(stats.gesamtstunden)} h` : '0 h'}
            subtitle={undefined}
            icon={Ship}
            accentColor="card-accent-top-warning"
          />
        </div>
      </div>

      {/* Quick Actions — centered */}
      <div className="grid gap-3 grid-cols-3 mb-8">
        <button
          onClick={() => setShowAusgabeForm(true)}
          className="card-premium rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center justify-center gap-2 hover:border-accent transition-colors group stagger-child text-center"
          style={{ '--stagger': 5 } as React.CSSProperties}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
            <Plus className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Neue Ausgabe</p>
            <p className="text-[11px] text-muted-foreground">Kosten erfassen</p>
          </div>
        </button>

        <Link
          to="/kalender"
          className="card-premium rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center justify-center gap-2 hover:border-accent transition-colors group stagger-child text-center"
          style={{ '--stagger': 6 } as React.CSSProperties}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
            <CalendarPlus className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Reservierung</p>
            <p className="text-[11px] text-muted-foreground">Boot reservieren</p>
          </div>
        </Link>

        <Link
          to="/gastsessions"
          className="card-premium rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center justify-center gap-2 hover:border-accent transition-colors group stagger-child text-center"
          style={{ '--stagger': 7 } as React.CSSProperties}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
            <UserPlus className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Session erfassen</p>
            <p className="text-[11px] text-muted-foreground">Gastsession buchen</p>
          </div>
        </Link>
      </div>

      {showAusgabeForm && (
        <AusgabeFormDialog onClose={() => setShowAusgabeForm(false)} autoOpen />
      )}

      {/* Season Overview */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 stagger-child" style={{ '--stagger': 8 } as React.CSSProperties}>
          Saison {currentYear}
        </h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <div
            className="card-premium rounded-xl border border-border bg-card p-4 stagger-child"
            style={{ '--stagger': 5 } as React.CSSProperties}
          >
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-red-400" />
              <span className="text-xs font-medium text-muted-foreground">Ausgaben</span>
            </div>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {formatCurrency(seasonTotalExpenses)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {seasonAusgaben.length} Posten
            </p>
          </div>

          <div
            className="card-premium rounded-xl border border-border bg-card p-4 stagger-child"
            style={{ '--stagger': 6 } as React.CSSProperties}
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">Gast-Sessions</span>
            </div>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {seasonSessions.length}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {formatCurrency(seasonSessionsTotal)} Einnahmen
            </p>
          </div>

          <div
            className="card-premium rounded-xl border border-border bg-card p-4 stagger-child"
            style={{ '--stagger': 7 } as React.CSSProperties}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-muted-foreground">Stunden</span>
            </div>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {seasonTotalHours.toFixed(1)} h
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {seasonLogs.length} Fahrten
            </p>
          </div>

          <div
            className="card-premium rounded-xl border border-border bg-card p-4 stagger-child"
            style={{ '--stagger': 8 } as React.CSSProperties}
          >
            <div className="flex items-center gap-2 mb-2">
              <Fuel className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium text-muted-foreground">Treibstoff</span>
            </div>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {seasonTotalFuel.toFixed(1)} L
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Saison {currentYear}
            </p>
          </div>
        </div>
      </div>

      {/* Next Booking + Recent Expenses */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Next Booking Card */}
        <div
          className="card-premium rounded-xl border border-border bg-card p-5 stagger-child"
          style={{ '--stagger': 9 } as React.CSSProperties}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Nächste Buchung
            </h2>
            <Link
              to="/kalender"
              className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5"
            >
              Kalender <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {nextReservation ? (
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'h-12 w-1.5 rounded-full',
                  FAHRER_FARBEN[nextReservation.fahrer as AlleFahrer]
                )}
              />
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {formatDateLong(nextReservation.datum)}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      FAHRER_TEXT_FARBEN[nextReservation.fahrer as AlleFahrer]
                    )}
                  >
                    {FAHRER_LABELS[nextReservation.fahrer as AlleFahrer]}
                  </span>
                  {!nextReservation.ganzer_tag && nextReservation.von_zeit && nextReservation.bis_zeit && (
                    <span className="text-xs text-muted-foreground">
                      {nextReservation.von_zeit} – {nextReservation.bis_zeit}
                    </span>
                  )}
                  {nextReservation.ganzer_tag && (
                    <span className="text-xs text-muted-foreground">Ganzer Tag</span>
                  )}
                </div>
                {nextReservation.notiz && (
                  <p className="text-xs text-muted-foreground mt-1">{nextReservation.notiz}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Calendar className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Keine Reservierungen geplant</p>
            </div>
          )}
        </div>

        {/* Recent Expenses Card */}
        <div
          className="card-premium rounded-xl border border-border bg-card p-5 stagger-child"
          style={{ '--stagger': 10 } as React.CSSProperties}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Letzte Ausgaben
            </h2>
            <Link
              to="/finanzen"
              className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5"
            >
              Alle anzeigen <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {letzteAusgaben.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <DollarSign className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Keine Ausgaben vorhanden</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {letzteAusgaben.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 align-middle">
                      <p className="font-medium text-foreground truncate max-w-[180px]">{a.bezeichnung}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(a.datum)}</p>
                    </td>
                    <td className="py-2 text-right align-middle tabular-nums font-semibold text-foreground whitespace-nowrap">
                      {formatCurrency(a.betrag)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  )
}

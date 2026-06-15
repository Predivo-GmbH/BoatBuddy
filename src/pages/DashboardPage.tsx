import { useMemo, useState, useEffect } from 'react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { PageSkeleton } from '@/components/shared/PageSkeleton'
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
  Anchor,
  Loader2,
} from 'lucide-react'
import { useKontoberechnung } from '@/hooks/useKontoberechnung'
import { useReservierungen } from '@/hooks/useReservierungen'
import { useGastsessions } from '@/hooks/useGastsessions'
import { useBootStats } from '@/hooks/useBootStats'
import { useAusgaben } from '@/hooks/useAusgaben'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { useFuelStats } from '@/hooks/useFuelStats'
import { formatCurrency, formatDate, formatDateLong, todayISO } from '@/lib/format'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, FAHRER_TEXT_FARBEN } from '@/lib/fahrer'
import type { AlleFahrer, Fahrer } from '@/lib/fahrer'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { OffenePostenCard } from '@/components/dashboard/OffenePostenCard'
import { NeuigkeitenCard } from '@/components/dashboard/NeuigkeitenCard'

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { data: kontoData, isLoading: kontoLoading } = useKontoberechnung()
  const { reservierungen, isLoading: resvLoading } = useReservierungen()
  const { sessions, isLoading: sessionsLoading } = useGastsessions()
  const { stats, isLoading: statsLoading } = useBootStats()
  const { ausgaben, isLoading: ausgabenLoading } = useAusgaben()
  const { logs, isLoading: logsLoading } = useNutzungslogs()

  const today = todayISO()
  const currentYear = today.slice(0, 4)

  // Re-evaluate every minute so a reservation drops off the moment it ends.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const nextReservation = useMemo(() => {
    const d = new Date(nowTick)
    const nowTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const upcoming = reservierungen
      .filter((r) => {
        if (r.datum > today) return true
        if (r.datum < today) return false
        // Today: keep only if it hasn't ended yet (whole-day or no end time = until day's end)
        if (r.ganzer_tag || !r.bis_zeit) return true
        return r.bis_zeit.slice(0, 5) >= nowTime
      })
      .sort((a, b) => {
        if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1
        return (a.von_zeit?.slice(0, 5) ?? '00:00').localeCompare(b.von_zeit?.slice(0, 5) ?? '00:00')
      })
    return upcoming.length > 0 ? upcoming[0] : null
  }, [reservierungen, today, nowTick])

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

  // Fuel = treibstoff expenses (same source as the Nutzung page), not per-trip litres
  const { seasonFuelCost, seasonFuelCount, seasonFuelLiters } = useFuelStats(currentYear)

  const seasonSessionsTotal = useMemo(() => {
    return seasonSessions.reduce((sum, s) => sum + Number(s.betrag), 0)
  }, [seasonSessions])

  const letzteAusgaben = useMemo(() => {
    return ausgaben.slice(0, 5)
  }, [ausgaben])

  const [showAusgabeForm, setShowAusgabeForm] = useState(false)
  const [showFahrtForm, setShowFahrtForm] = useState(false)
  const [fahrtFahrer, setFahrtFahrer] = useState<Fahrer>('roger')
  const [fahrtDatum, setFahrtDatum] = useState(todayISO())
  const [fahrtStunden, setFahrtStunden] = useState('')
  const [fahrtNotiz, setFahrtNotiz] = useState('')
  const { createNutzungslog } = useNutzungslogs()

  const letzteGesamtstunden = stats ? Number(stats.gesamtstunden) : 0
  const neuerStand = parseFloat(fahrtStunden)
  const fahrtDifferenz = !isNaN(neuerStand) ? neuerStand - letzteGesamtstunden : null

  const handleQuickLog = () => {
    if (isNaN(neuerStand) || neuerStand <= letzteGesamtstunden) {
      toast.error(`Neuer Stand muss grösser als ${letzteGesamtstunden} h sein`)
      return
    }
    const delta = neuerStand - letzteGesamtstunden
    createNutzungslog.mutate(
      { datum: fahrtDatum, fahrer: fahrtFahrer, betriebsstunden: delta, neue_gesamtstunden: neuerStand, aktivitaeten: [], notiz: fahrtNotiz.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Fahrt erfasst')
          setShowFahrtForm(false)
          setFahrtStunden('')
          setFahrtDatum(todayISO())
          setFahrtNotiz('')
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern'),
      },
    )
  }

  const isLoading = kontoLoading || resvLoading || sessionsLoading || statsLoading || ausgabenLoading || logsLoading

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Alles auf einen Blick" />
        <PageSkeleton cards={4} table />
      </div>
    )
  }

  return (
    <div className="section-fade-in">
      <PageHeader title="Dashboard" subtitle="Alles auf einen Blick" />

      {/* Next Reservation — hero card */}
      <div
        className="card-premium card-accent-top-success rounded-xl border border-border bg-card p-6 mb-6 stagger-child"
        style={{ '--stagger': 0 } as React.CSSProperties}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Nächste Reservierung
            </h2>
          </div>
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
                'h-14 w-1.5 rounded-full',
                FAHRER_FARBEN[nextReservation.fahrer as AlleFahrer]
              )}
            />
            <div>
              <p className="text-2xl font-bold text-foreground">
                {formatDateLong(nextReservation.datum)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    'text-sm font-medium',
                    FAHRER_TEXT_FARBEN[nextReservation.fahrer as AlleFahrer]
                  )}
                >
                  {FAHRER_LABELS[nextReservation.fahrer as AlleFahrer]}
                </span>
                {nextReservation.von_zeit && nextReservation.bis_zeit && (
                  <span className="text-xs text-muted-foreground">
                    {nextReservation.von_zeit.slice(0, 5)} – {nextReservation.bis_zeit.slice(0, 5)} Uhr
                  </span>
                )}
              </div>
              {nextReservation.notiz && (
                <p className="text-xs text-muted-foreground mt-1">{nextReservation.notiz}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
            <Calendar className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Keine Reservierungen geplant</p>
            <Link to="/kalender" className="mt-2 text-xs text-accent hover:underline">Boot reservieren</Link>
          </div>
        )}
      </div>

      {/* What's New — recent changes */}
      <NeuigkeitenCard />

      {/* Open Items — actionable from Dashboard */}
      <OffenePostenCard />

      {/* 4 Stat Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8 slide-up-stagger">
        <Link to="/finanzen" className="block">
          <StatCard
            label={`Ausgaben ${currentYear}`}
            value={formatCurrency(seasonTotalExpenses)}
            subtitle={`${seasonAusgaben.length} Posten`}
            icon={DollarSign}
            gradient="red"
          />
        </Link>
        <Link to="/finanzen" className="block">
          <StatCard
            label="Bootkonto"
            value={kontoData ? formatCurrency(kontoData.saldo) : '--'}
            subtitle="Berechnet aus Beiträgen & Ausgaben"
            icon={Wallet}
            gradient="green"
          />
        </Link>
        <Link to="/gastsessions" className="block">
          <StatCard
            label={`Gast-Sessions ${currentYear}`}
            value={String(seasonSessions.length)}
            subtitle={`${formatCurrency(seasonSessionsTotal)} Einnahmen`}
            icon={Users}
            gradient="blue"
          />
        </Link>
        <Link to="/nutzung" className="block">
          <StatCard
            label="Betriebsstunden"
            value={stats ? `${Number(stats.gesamtstunden)} h` : '0 h'}
            subtitle={`Saison ${currentYear}: ${seasonTotalHours.toFixed(1)} h`}
            icon={Ship}
            accentColor="card-accent-top-warning"
            gradient="amber"
          />
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-8 slide-up-stagger">
        <button
          onClick={() => setShowFahrtForm(true)}
          className="action-card rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center justify-center gap-2 hover:border-accent group text-center press-scale"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
            <Anchor className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Fahrt loggen</p>
            <p className="text-[11px] text-muted-foreground">Heutige Fahrt</p>
          </div>
        </button>

        <button
          onClick={() => setShowAusgabeForm(true)}
          className="action-card rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center justify-center gap-2 hover:border-accent group text-center press-scale"
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
          className="action-card rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center justify-center gap-2 hover:border-accent group text-center"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
            <CalendarPlus className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Reservierung</p>
            <p className="text-[11px] text-muted-foreground">Boot buchen</p>
          </div>
        </Link>

        <Link
          to="/gastsessions"
          className="action-card rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center justify-center gap-2 hover:border-accent group text-center"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
            <UserPlus className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Gastsession</p>
            <p className="text-[11px] text-muted-foreground">Session buchen</p>
          </div>
        </Link>
      </div>

      {/* Quick Trip Log Dialog */}
      {showFahrtForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowFahrtForm(false)}>
          <div className="w-full max-w-sm rounded-xl bg-card border border-border p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground mb-4">Fahrt loggen</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Datum</label>
                <input
                  type="date"
                  value={fahrtDatum}
                  onChange={e => setFahrtDatum(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Fahrer</label>
                <select
                  value={fahrtFahrer}
                  onChange={e => setFahrtFahrer(e.target.value as Fahrer)}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {FAHRER.map(f => (
                    <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Neuer Stand * <span className="text-muted-foreground/60">(Letzter: {letzteGesamtstunden} h)</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={letzteGesamtstunden + 0.1}
                  value={fahrtStunden}
                  onChange={e => setFahrtStunden(e.target.value)}
                  placeholder={`z.B. ${(letzteGesamtstunden + 2.5).toFixed(1)}`}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                {fahrtDifferenz !== null && fahrtDifferenz > 0 && (
                  <p className="mt-1 text-xs text-accent font-medium">+{fahrtDifferenz.toFixed(1)} h Differenz</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notiz / weitere Infos</label>
                <input
                  value={fahrtNotiz}
                  onChange={e => setFahrtNotiz(e.target.value)}
                  placeholder="Optional — z.B. Aktivität, Gäste, Bemerkung"
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowFahrtForm(false)}
                className="flex-1 min-h-[44px] rounded-lg border border-input px-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleQuickLog}
                disabled={createNutzungslog.isPending}
                className="flex-1 min-h-[44px] rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {createNutzungslog.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Erfassen
              </button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              Für Details (Aktivitäten, Notizen) → <Link to="/nutzung" className="text-accent hover:underline">Nutzungslog</Link>
            </p>
          </div>
        </div>
      )}

      {showAusgabeForm && (
        <AusgabeFormDialog onClose={() => setShowAusgabeForm(false)} autoOpen />
      )}

      {/* Season Overview */}
      <div className="mb-8 slide-up">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Saison {currentYear}
        </h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 slide-up-stagger">
          <Link to="/finanzen" className="card-premium card-glow card-gradient-red rounded-xl border border-border p-4 block hover:border-accent/50 transition-colors">
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
          </Link>

          <Link to="/gastsessions" className="card-premium card-glow card-gradient-blue rounded-xl border border-border p-4 block hover:border-accent/50 transition-colors">
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
          </Link>

          <Link to="/nutzung" className="card-premium card-glow card-gradient-amber rounded-xl border border-border p-4 block hover:border-accent/50 transition-colors">
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
          </Link>

          <Link to="/nutzung" className="card-premium card-glow card-gradient-green rounded-xl border border-border p-4 block hover:border-accent/50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Fuel className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium text-muted-foreground">Treibstoff</span>
            </div>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {formatCurrency(seasonFuelCost)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {seasonFuelLiters > 0 && `${seasonFuelLiters.toFixed(1)} L · `}{seasonFuelCount} {seasonFuelCount === 1 ? 'Tankfüllung' : 'Tankfüllungen'}
            </p>
          </Link>
        </div>
      </div>

      {/* Next Booking + Recent Expenses */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8 slide-up-stagger">
        {/* Letzte Fahrten Card */}
        <div className="card-premium card-glow rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Letzte Fahrten
            </h2>
            <Link
              to="/nutzung"
              className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5"
            >
              Alle anzeigen <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Ship className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Noch keine Fahrten erfasst</p>
              <Link to="/nutzung" className="mt-2 text-xs text-accent hover:underline">Erste Fahrt loggen</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between border-b border-border/50 last:border-0 py-2 row-lift rounded-md px-1">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatDate(l.datum)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('text-xs font-medium', FAHRER_TEXT_FARBEN[l.fahrer as AlleFahrer])}>
                        {FAHRER_LABELS[l.fahrer as AlleFahrer] ?? l.fahrer}
                      </span>
                      {l.notiz && <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{l.notiz}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">{Number(l.betriebsstunden).toFixed(1)} h</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Expenses Card */}
        <div className="card-premium card-glow rounded-xl border border-border bg-card p-5">
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
                  <tr key={a.id} className="border-b border-border/50 last:border-0 row-lift rounded-md">
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

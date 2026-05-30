import { useState } from 'react'
import { addMonths, subMonths, format, isSameMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { PageHeader } from '@/components/shared/PageHeader'
import { KalenderRaster } from '@/components/kalender/KalenderRaster'
import { ReservierungDialog } from '@/components/kalender/ReservierungDialog'
import { FerienDialog } from '@/components/kalender/FerienDialog'
import { useReservierungen } from '@/hooks/useReservierungen'
import { useFerien } from '@/hooks/useFerien'
import { CalendarSkeleton } from '@/components/shared/PageSkeleton'
import { ChevronLeft, ChevronRight, CalendarDays, Palmtree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAHRER_FARBEN, FAHRER_LABELS } from '@/lib/fahrer'
import type { AlleFahrer } from '@/lib/fahrer'
import type { Ferien } from '@/types'
import { formatDate, formatDateLong, todayISO } from '@/lib/format'

export default function KalenderPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showFerienDialog, setShowFerienDialog] = useState(false)
  const [selectedFerien, setSelectedFerien] = useState<Ferien | null>(null)

  const { reservierungen: alleReservierungen, isLoading } = useReservierungen()
  const { ferien } = useFerien()

  const today = todayISO()
  const kommende = alleReservierungen
    .filter(r => r.datum >= today)
    .slice(0, 10)
  const weitereAnzahl = Math.max(0, alleReservierungen.filter(r => r.datum >= today).length - 10)

  const isCurrentMonth = isSameMonth(currentDate, new Date())

  return (
    <div className="slide-up space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Kalender" subtitle="Reservierungen & Verfügbarkeit" />
        <button
          onClick={() => setShowFerienDialog(true)}
          className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20"
        >
          <Palmtree className="h-4 w-4" />
          <span className="hidden sm:inline">Ferien eintragen</span>
        </button>
      </div>

      <div className="card-premium card-glow rounded-lg border border-border bg-card p-4 sm:p-6">
        {/* Month navigation */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => setCurrentDate(d => subMonths(d, 1))}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: de })}
            </h2>
            <button
              onClick={() => setCurrentDate(new Date())}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                isCurrentMonth
                  ? 'bg-accent/10 text-accent cursor-default'
                  : 'bg-muted text-muted-foreground hover:bg-accent/10 hover:text-accent',
              )}
              disabled={isCurrentMonth}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Heute
            </button>
          </div>

          <button
            onClick={() => setCurrentDate(d => addMonths(d, 1))}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-4">
            <CalendarSkeleton />
          </div>
        ) : (
          <KalenderRaster
            currentDate={currentDate}
            reservierungen={alleReservierungen}
            ferien={ferien}
            onDayClick={setSelectedDate}
          />
        )}
      </div>

      {/* Upcoming reservations */}
      <div className="card-premium card-glow rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Kommende Reservierungen
        </h2>

        {kommende.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Keine kommenden Reservierungen
          </p>
        ) : (
          <div className="table-premium overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {kommende.map(r => (
                  <tr key={r.id} onClick={() => setSelectedDate(r.datum)} className="cursor-pointer row-accent border-b border-border/50 last:border-0 hover:bg-muted/50">
                    <td className="py-3 pr-4 text-foreground">
                      {formatDateLong(r.datum)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-2.5 w-2.5 flex-shrink-0 rounded-full',
                            FAHRER_FARBEN[r.fahrer as AlleFahrer] ?? 'bg-muted',
                          )}
                        />
                        <span className="font-medium text-foreground">
                          {FAHRER_LABELS[r.fahrer as AlleFahrer] ?? r.fahrer}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        {r.von_zeit && r.bis_zeit
                          ? `${r.von_zeit.slice(0, 5)} – ${r.bis_zeit.slice(0, 5)}`
                          : 'Ganzer Tag'}
                      </span>
                    </td>
                    {r.notiz && (
                      <td className="py-3 text-muted-foreground">
                        {r.notiz}
                      </td>
                    )}
                    {!r.notiz && <td className="py-3" />}
                  </tr>
                ))}
              </tbody>
            </table>
            {weitereAnzahl > 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                und {weitereAnzahl} weitere…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Upcoming vacations */}
      {ferien.filter(f => f.bis_datum >= today).length > 0 && (
        <div className="card-premium card-glow rounded-lg border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Palmtree className="h-4 w-4 text-success" />
            Kommende Ferien
          </h2>
          <div className="space-y-2">
            {ferien
              .filter(f => f.bis_datum >= today)
              .map(f => (
                <div key={f.id} onClick={() => setSelectedFerien(f)} className="flex cursor-pointer items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 flex-shrink-0 rounded-full',
                      FAHRER_FARBEN[f.fahrer as AlleFahrer] ?? 'bg-muted',
                    )}
                  />
                  <span className="font-medium text-foreground text-sm">
                    {FAHRER_LABELS[f.fahrer as AlleFahrer] ?? f.fahrer}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(f.von_datum)} – {formatDate(f.bis_datum)}
                  </span>
                  {f.notiz && (
                    <span className="text-sm text-muted-foreground">— {f.notiz}</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {selectedDate && (
        <ReservierungDialog
          datum={selectedDate}
          reservierungen={alleReservierungen}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {showFerienDialog && (
        <FerienDialog onClose={() => setShowFerienDialog(false)} />
      )}

      {selectedFerien && (
        <FerienDialog editFerien={selectedFerien} onClose={() => setSelectedFerien(null)} />
      )}
    </div>
  )
}

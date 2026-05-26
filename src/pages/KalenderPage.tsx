import { useState } from 'react'
import { addMonths, subMonths, format, isSameMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { PageHeader } from '@/components/shared/PageHeader'
import { KalenderRaster } from '@/components/kalender/KalenderRaster'
import { ReservierungDialog } from '@/components/kalender/ReservierungDialog'
import { useReservierungen } from '@/hooks/useReservierungen'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function KalenderPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monat = currentDate.getMonth()
  const jahr = currentDate.getFullYear()
  const { reservierungen } = useReservierungen(monat, jahr)

  const isCurrentMonth = isSameMonth(currentDate, new Date())

  return (
    <div className="section-fade-in">
      <PageHeader title="Kalender" />

      <div className="card-premium rounded-lg border border-border bg-card p-4 sm:p-6">
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

        <KalenderRaster
          currentDate={currentDate}
          reservierungen={reservierungen}
          onDayClick={setSelectedDate}
        />
      </div>

      {selectedDate && (
        <ReservierungDialog
          datum={selectedDate}
          reservierungen={reservierungen}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}

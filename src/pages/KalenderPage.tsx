import { useState } from 'react'
import { addMonths, subMonths, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { PageHeader } from '@/components/shared/PageHeader'
import { KalenderRaster } from '@/components/kalender/KalenderRaster'
import { ReservierungDialog } from '@/components/kalender/ReservierungDialog'
import { useReservierungen } from '@/hooks/useReservierungen'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function KalenderPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monat = currentDate.getMonth()
  const jahr = currentDate.getFullYear()
  const { reservierungen } = useReservierungen(monat, jahr)

  return (
    <>
      <PageHeader title="Kalender" />

      <div className="rounded-lg border border-border bg-card p-4">
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentDate(d => subMonths(d, 1))}
            className="rounded-md p-2 hover:bg-muted"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: de })}
          </h2>
          <button
            onClick={() => setCurrentDate(d => addMonths(d, 1))}
            className="rounded-md p-2 hover:bg-muted"
            aria-label="Nachster Monat"
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
    </>
  )
}

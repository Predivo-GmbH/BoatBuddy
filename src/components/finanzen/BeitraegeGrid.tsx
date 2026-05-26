import { useState } from 'react'
import { useBeitraege } from '@/hooks/useBeitraege'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Check, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const MONATE = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
]

export function BeitraegeGrid() {
  const [jahr, setJahr] = useState(new Date().getFullYear())
  const { beitraege, isLoading, createBeitrag, deleteBeitrag } = useBeitraege(jahr)

  const getBeitrag = (fahrer: Fahrer, monatIdx: number) => {
    const monatStr = `${jahr}-${String(monatIdx + 1).padStart(2, '0')}-01`
    return beitraege.find(b => b.fahrer === fahrer && b.monat === monatStr)
  }

  const handleToggle = async (fahrer: Fahrer, monatIdx: number) => {
    const existing = getBeitrag(fahrer, monatIdx)
    const monatStr = `${jahr}-${String(monatIdx + 1).padStart(2, '0')}-01`

    if (existing) {
      deleteBeitrag.mutate(existing.id, {
        onError: () => toast.error('Fehler beim Löschen'),
      })
    } else {
      createBeitrag.mutate(
        { fahrer, betrag: jahr <= 2023 ? 300 : 400, monat: monatStr },
        { onError: () => toast.error('Fehler beim Erstellen') },
      )
    }
  }

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const outstandingCount = FAHRER.reduce((total, fahrer) => {
    const now = new Date()
    for (let m = 0; m < 12; m++) {
      const monthEnd = new Date(jahr, m + 1, 0)
      if (monthEnd < now && !getBeitrag(fahrer, m)) {
        total++
      }
    }
    return total
  }, 0)

  return (
    <div className="space-y-4">
      {/* Year selector + outstanding badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setJahr(j => j - 1)}
          className="rounded-lg p-2 transition-colors hover:bg-muted"
          aria-label="Vorjahr"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-[4rem] text-center text-lg font-semibold tabular-nums">{jahr}</span>
        <button
          onClick={() => setJahr(j => j + 1)}
          className="rounded-lg p-2 transition-colors hover:bg-muted"
          aria-label="Nachstes Jahr"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <span
          className={cn(
            'ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            outstandingCount > 0
              ? 'bg-destructive/15 text-destructive'
              : 'bg-success/15 text-success'
          )}
        >
          {outstandingCount > 0 ? `${outstandingCount} ausstehend` : 'Alles bezahlt'}
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2.5 pr-4 text-left font-medium text-muted-foreground">Fahrer</th>
              {MONATE.map(m => (
                <th key={m} className="px-1 py-2.5 text-center font-medium text-muted-foreground sm:px-2">{m}</th>
              ))}
              <th className="py-2.5 pl-4 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {FAHRER.map(fahrer => {
              const total = Array.from({ length: 12 }, (_, i) => getBeitrag(fahrer, i)).filter((b): b is NonNullable<typeof b> => !!b).reduce((sum, b) => sum + Number(b.betrag), 0)
              return (
                <tr key={fahrer} className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <span className={cn('h-2.5 w-2.5 rounded-full', FAHRER_FARBEN[fahrer])} />
                      {FAHRER_LABELS[fahrer]}
                    </span>
                  </td>
                  {Array.from({ length: 12 }, (_, monatIdx) => {
                    const paid = !!getBeitrag(fahrer, monatIdx)
                    const isPast = new Date(jahr, monatIdx + 1, 0) < new Date()
                    const isFuture = !isPast && !paid
                    return (
                      <td key={monatIdx} className="px-1 py-2.5 text-center sm:px-2">
                        <button
                          onClick={() => handleToggle(fahrer, monatIdx)}
                          className={cn(
                            'inline-flex h-10 w-10 items-center justify-center rounded-lg transition-all',
                            'sm:h-9 sm:w-9',
                            paid
                              ? 'bg-success/20 text-success shadow-sm hover:bg-success/30'
                              : isPast
                                ? 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20 hover:bg-destructive/20'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80',
                            isFuture && 'opacity-50'
                          )}
                          title={paid ? 'Bezahlt -- klicken zum Entfernen' : isPast ? 'Ausstehend -- klicken zum Markieren' : 'Zukunftig -- klicken zum Markieren'}
                        >
                          {paid ? <Check className="h-4 w-4" /> : <X className="h-3 w-3" />}
                        </button>
                      </td>
                    )
                  })}
                  <td className="py-2.5 pl-4 text-right font-semibold tabular-nums">{formatCurrency(total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex justify-end text-sm text-muted-foreground">
        Total eingezahlt: <span className="ml-1 font-semibold text-foreground tabular-nums">
          {formatCurrency(beitraege.reduce((sum, b) => sum + Number(b.betrag), 0))}
        </span>
      </div>
    </div>
  )
}

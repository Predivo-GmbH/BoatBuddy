import { useState } from 'react'
import { useReservierungen } from '@/hooks/useReservierungen'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Reservierung } from '@/types'

interface ReservierungDialogProps {
  datum: string
  reservierungen: Reservierung[]
  onClose: () => void
}

export function ReservierungDialog({ datum, reservierungen, onClose }: ReservierungDialogProps) {
  const [fahrer, setFahrer] = useState<Fahrer>('roger')
  const [notiz, setNotiz] = useState('')
  const { createReservierung, deleteReservierung } = useReservierungen()

  const existing = reservierungen.filter(r => r.datum === datum)

  const handleCreate = () => {
    if (existing.some(r => r.fahrer === fahrer)) {
      toast.error(`${FAHRER_LABELS[fahrer]} hat an diesem Tag bereits reserviert`)
      return
    }
    createReservierung.mutate(
      { fahrer, datum, notiz: notiz.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Reservierung erstellt')
          setNotiz('')
        },
        onError: () => toast.error('Fehler beim Erstellen'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{formatDateLong(datum)}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Existing reservations */}
        {existing.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Reservierungen</p>
            {existing.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className={cn('h-2.5 w-2.5 rounded-full', FAHRER_FARBEN[r.fahrer])} />
                  {FAHRER_LABELS[r.fahrer]}
                  {r.notiz && <span className="text-muted-foreground">— {r.notiz}</span>}
                </span>
                <button
                  onClick={() => deleteReservierung.mutate(r.id, { onError: () => toast.error('Fehler') })}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Loschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new */}
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Neue Reservierung</p>
          <div className="flex gap-2">
            {FAHRER.map(f => (
              <button
                key={f}
                onClick={() => setFahrer(f)}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  fahrer === f
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {FAHRER_LABELS[f]}
              </button>
            ))}
          </div>
          <input
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="Notiz (optional)"
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleCreate}
            disabled={createReservierung.isPending}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            Reservieren
          </button>
        </div>
      </div>
    </div>
  )
}

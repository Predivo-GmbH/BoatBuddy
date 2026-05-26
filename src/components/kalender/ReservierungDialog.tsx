import { useState, useEffect } from 'react'
import { useReservierungen } from '@/hooks/useReservierungen'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, FAHRER_BORDER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { X, Trash2, Clock, Sun } from 'lucide-react'
import { toast } from 'sonner'
import type { Reservierung } from '@/types'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

interface ReservierungDialogProps {
  datum: string
  reservierungen: Reservierung[]
  onClose: () => void
}

export function ReservierungDialog({ datum, reservierungen, onClose }: ReservierungDialogProps) {
  const [fahrer, setFahrer] = useState<Fahrer>('roger')
  const [notiz, setNotiz] = useState('')
  const [ganzerTag, setGanzerTag] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { createReservierung, deleteReservierung } = useReservierungen()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const existing = reservierungen.filter(r => r.datum === datum)

  const handleCreate = () => {
    if (existing.some(r => r.fahrer === fahrer)) {
      toast.error(`${FAHRER_LABELS[fahrer]} hat an diesem Tag bereits reserviert`)
      return
    }
    createReservierung.mutate(
      { fahrer, datum, notiz: notiz.trim() || undefined, ganzer_tag: ganzerTag },
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm origin-center animate-in zoom-in-95 fade-in space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{formatDateLong(datum)}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Existing reservations */}
        {existing.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Reservierungen
            </p>
            {existing.map(r => (
              <div
                key={r.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border-l-4 bg-muted px-3 py-2.5',
                  FAHRER_BORDER_FARBEN[r.fahrer],
                )}
              >
                <span className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white',
                      FAHRER_FARBEN[r.fahrer],
                    )}
                  >
                    {FAHRER_LABELS[r.fahrer].charAt(0)}
                  </span>
                  <span className="font-medium">{FAHRER_LABELS[r.fahrer]}</span>
                  {!r.ganzer_tag && (
                    <span className="rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Halbtag
                    </span>
                  )}
                  {r.notiz && (
                    <span className="text-muted-foreground">— {r.notiz}</span>
                  )}
                </span>
                <button
                  onClick={() => setDeleteId(r.id)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={deleteId !== null}
          onConfirm={() => {
            if (deleteId) {
              deleteReservierung.mutate(deleteId, {
                onSuccess: () => setDeleteId(null),
                onError: () => toast.error('Fehler'),
              })
            }
          }}
          onCancel={() => setDeleteId(null)}
          isPending={deleteReservierung.isPending}
        />

        {/* Add new */}
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Neue Reservierung
          </p>

          {/* Person selector */}
          <div className="flex gap-2">
            {FAHRER.map(f => {
              const isSelected = fahrer === f
              const alreadyBooked = existing.some(r => r.fahrer === f)
              return (
                <button
                  key={f}
                  onClick={() => setFahrer(f)}
                  disabled={alreadyBooked}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg border-l-4 px-3 py-2.5 text-sm font-medium transition-all',
                    FAHRER_BORDER_FARBEN[f],
                    isSelected
                      ? 'bg-accent/10 text-accent shadow-sm ring-1 ring-accent/30'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                    alreadyBooked && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white',
                      FAHRER_FARBEN[f],
                    )}
                  >
                    {FAHRER_LABELS[f].charAt(0)}
                  </span>
                  {FAHRER_LABELS[f]}
                </button>
              )
            })}
          </div>

          {/* Ganzer Tag / Halbtag toggle */}
          <div className="flex rounded-lg bg-muted p-1">
            <button
              onClick={() => setGanzerTag(true)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
                ganzerTag
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              Ganzer Tag
            </button>
            <button
              onClick={() => setGanzerTag(false)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
                !ganzerTag
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              Halbtag
            </button>
          </div>

          {/* Notiz */}
          <input
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="Notiz (optional)"
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={createReservierung.isPending}
            className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {createReservierung.isPending ? 'Wird gespeichert...' : 'Reservieren'}
          </button>
        </div>
      </div>
    </div>
  )
}

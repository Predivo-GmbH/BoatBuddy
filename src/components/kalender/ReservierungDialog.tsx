import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useReservierungen } from '@/hooks/useReservierungen'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, FAHRER_BORDER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { X, Trash2, Pencil, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { Reservierung } from '@/types'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const DAUER_OPTIONS = [1, 2, 3, 4, 5, 6] as const

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMin = h * 60 + m + hours * 60
  const endH = Math.floor(totalMin / 60) % 24
  const endM = totalMin % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

function formatTimeRange(von: string | null, bis: string | null): string | null {
  if (!von || !bis) return null
  return `${von.slice(0, 5)} – ${bis.slice(0, 5)}`
}

interface ReservierungDialogProps {
  datum: string
  reservierungen: Reservierung[]
  onClose: () => void
}

export function ReservierungDialog({ datum, reservierungen, onClose }: ReservierungDialogProps) {
  const [fahrer, setFahrer] = useState<Fahrer | ''>('')
  const [notiz, setNotiz] = useState('')
  const [vonZeit, setVonZeit] = useState('10:00')
  const [dauer, setDauer] = useState(3)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { createReservierung, updateReservierung, deleteReservierung } = useReservierungen()
  const trapRef = useFocusTrap<HTMLDivElement>(true)

  const isPending = createReservierung.isPending || updateReservierung.isPending || deleteReservierung.isPending

  const close = useCallback(() => {
    if (!isPending) onClose()
  }, [isPending, onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [close])

  const existing = reservierungen.filter(r => r.datum === datum)
  const bisZeit = addHours(vonZeit, dauer)

  const handleEdit = (r: Reservierung) => {
    setEditingId(r.id)
    setFahrer(r.fahrer)
    setVonZeit(r.von_zeit?.slice(0, 5) ?? '10:00')
    if (r.von_zeit && r.bis_zeit) {
      const [vH, vM] = r.von_zeit.split(':').map(Number)
      const [bH, bM] = r.bis_zeit.split(':').map(Number)
      const diff = Math.round(((bH * 60 + bM) - (vH * 60 + vM)) / 60)
      setDauer(DAUER_OPTIONS.includes(diff as typeof DAUER_OPTIONS[number]) ? diff : 3)
    } else {
      setDauer(3)
    }
    setNotiz(r.notiz ?? '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFahrer('')
    setVonZeit('10:00')
    setDauer(3)
    setNotiz('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!fahrer) {
      toast.error('Bitte einen Fahrer auswählen')
      return
    }

    if (editingId) {
      updateReservierung.mutate(
        {
          id: editingId,
          fahrer,
          ganzer_tag: false,
          von_zeit: vonZeit,
          bis_zeit: bisZeit,
          notiz: notiz.trim() || undefined,
        },
        {
          onSuccess: () => {
            toast.success('Reservierung aktualisiert')
            cancelEdit()
          },
          onError: () => toast.error('Fehler beim Aktualisieren'),
        },
      )
      return
    }

    if (existing.some(r => r.fahrer === fahrer)) {
      toast.error(`${FAHRER_LABELS[fahrer]} hat an diesem Tag bereits reserviert`)
      return
    }
    createReservierung.mutate(
      {
        fahrer,
        datum,
        ganzer_tag: false,
        von_zeit: vonZeit,
        bis_zeit: bisZeit,
        notiz: notiz.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Reservierung erstellt')
          onClose()
        },
        onError: () => toast.error('Fehler beim Erstellen'),
      },
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservierung-dialog-title"
        className="mx-4 w-full max-w-sm origin-center animate-in zoom-in-95 fade-in space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="reservierung-dialog-title" className="text-lg font-semibold">{formatDateLong(datum)}</h2>
          <button
            onClick={close}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Schliessen"
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
                  {formatTimeRange(r.von_zeit, r.bis_zeit) && (
                    <span className="flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      <Clock className="h-3 w-3" />
                      {formatTimeRange(r.von_zeit, r.bis_zeit)}
                    </span>
                  )}
                  {r.notiz && (
                    <span className="text-muted-foreground">— {r.notiz}</span>
                  )}
                </span>
                <div className="flex items-center">
                  <button
                    onClick={() => handleEdit(r)}
                    className="min-h-[44px] min-w-[44px] rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent flex items-center justify-center"
                    aria-label={`${FAHRER_LABELS[r.fahrer]} Reservierung bearbeiten`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(r.id)}
                    className="min-h-[44px] min-w-[44px] rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                    aria-label={`${FAHRER_LABELS[r.fahrer]} Reservierung löschen`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={deleteId !== null}
          onConfirm={() => {
            if (deleteId) {
              deleteReservierung.mutate(deleteId, {
                onSuccess: () => {
                  toast.success('Reservierung gelöscht')
                  setDeleteId(null)
                },
                onError: () => toast.error('Fehler beim Löschen'),
              })
            }
          }}
          onCancel={() => setDeleteId(null)}
          isPending={deleteReservierung.isPending}
        />

        {/* Add new */}
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {editingId ? 'Reservierung bearbeiten' : 'Neue Reservierung'}
            </p>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Abbrechen
              </button>
            )}
          </div>

          {/* Person selector */}
          <div className="flex gap-2" role="radiogroup" aria-label="Fahrer auswählen">
            {FAHRER.map(f => {
              const isSelected = fahrer === f
              const alreadyBooked = existing.some(r => r.fahrer === f && r.id !== editingId)
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFahrer(f)}
                  disabled={alreadyBooked || isPending}
                  role="radio"
                  aria-checked={isSelected}
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

          {/* Start time + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reservierung-startzeit" className="mb-1.5 block text-xs font-medium text-muted-foreground">Startzeit</label>
              <input
                id="reservierung-startzeit"
                type="time"
                value={vonZeit}
                onChange={e => setVonZeit(e.target.value)}
                disabled={isPending}
                className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="reservierung-dauer" className="mb-1.5 block text-xs font-medium text-muted-foreground">Dauer</label>
              <select
                id="reservierung-dauer"
                value={dauer}
                onChange={e => setDauer(Number(e.target.value))}
                disabled={isPending}
                className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              >
                {DAUER_OPTIONS.map(h => (
                  <option key={h} value={h}>{h} {h === 1 ? 'Stunde' : 'Stunden'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Computed end time display */}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {vonZeit.slice(0, 5)} – {bisZeit} Uhr
          </p>

          {/* Notiz */}
          <input
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="Notiz (optional)"
            disabled={isPending}
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !fahrer}
            className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'Wird gespeichert...' : editingId ? 'Speichern' : 'Reservieren'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

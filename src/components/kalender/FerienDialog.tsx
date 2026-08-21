import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useFerien } from '@/hooks/useFerien'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, FAHRER_BORDER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { X, Trash2, Pencil, Palmtree, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { Ferien } from '@/types'

interface FerienDialogProps {
  editFerien?: Ferien | null
  onClose: () => void
}

export function FerienDialog({ editFerien, onClose }: FerienDialogProps) {
  const [fahrer, setFahrer] = useState<Fahrer | ''>(editFerien?.fahrer ?? '')
  const [vonDatum, setVonDatum] = useState(editFerien?.von_datum ?? '')
  const [bisDatum, setBisDatum] = useState(editFerien?.bis_datum ?? '')
  const [notiz, setNotiz] = useState(editFerien?.notiz ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { createFerien, updateFerien, deleteFerien } = useFerien()
  const trapRef = useFocusTrap<HTMLDivElement>(true)

  const isPending = createFerien.isPending || updateFerien.isPending || deleteFerien.isPending

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

  const handleStartEdit = () => {
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    if (editFerien) {
      setFahrer(editFerien.fahrer)
      setVonDatum(editFerien.von_datum)
      setBisDatum(editFerien.bis_datum)
      setNotiz(editFerien.notiz ?? '')
    }
    setIsEditing(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!fahrer) {
      toast.error('Bitte eine Person auswaehlen')
      return
    }
    if (!vonDatum || !bisDatum) {
      toast.error('Bitte Von- und Bis-Datum angeben')
      return
    }
    if (bisDatum < vonDatum) {
      toast.error('Bis-Datum muss nach Von-Datum liegen')
      return
    }

    if (editFerien && isEditing) {
      updateFerien.mutate(
        {
          id: editFerien.id,
          fahrer,
          von_datum: vonDatum,
          bis_datum: bisDatum,
          notiz: notiz.trim() || null,
        },
        {
          onSuccess: () => {
            toast.success('Ferien aktualisiert')
            onClose()
          },
          onError: () => toast.error('Fehler beim Aktualisieren'),
        },
      )
      return
    }

    createFerien.mutate(
      {
        fahrer,
        von_datum: vonDatum,
        bis_datum: bisDatum,
        notiz: notiz.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Ferien eingetragen')
          onClose()
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  // View mode: showing an existing vacation with edit/delete options
  const isViewMode = editFerien && !isEditing

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        ref={trapRef}
        role="dialog"
        data-gate-a="FerienDialog"
        aria-modal="true"
        aria-labelledby="ferien-dialog-title"
        className="mx-4 w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain origin-center animate-in zoom-in-95 fade-in space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="ferien-dialog-title" className="flex items-center gap-2 text-lg font-semibold">
            <Palmtree className="h-5 w-5 text-success" />
            {isViewMode ? 'Ferien' : editFerien ? 'Ferien bearbeiten' : 'Ferien eintragen'}
          </h2>
          <button
            onClick={close}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Schliessen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isViewMode ? (
          /* View mode — show vacation details with edit/delete buttons */
          <>
            <div
              className={cn(
                'rounded-lg border-l-4 bg-muted px-4 py-3',
                FAHRER_BORDER_FARBEN[editFerien.fahrer],
              )}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white',
                    FAHRER_FARBEN[editFerien.fahrer],
                  )}
                >
                  {FAHRER_LABELS[editFerien.fahrer].charAt(0)}
                </span>
                <span className="text-base font-semibold">{FAHRER_LABELS[editFerien.fahrer]}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(editFerien.von_datum)} – {formatDate(editFerien.bis_datum)}
              </div>
              {editFerien.notiz && (
                <p className="mt-1.5 text-sm text-muted-foreground">{editFerien.notiz}</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleStartEdit}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Pencil className="h-4 w-4" />
                Bearbeiten
              </button>
              <button
                onClick={() => setDeleteId(editFerien.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Entfernen
              </button>
            </div>

            <ConfirmDialog
              open={deleteId !== null}
              title="Ferien entfernen?"
              description={`Ferien von ${FAHRER_LABELS[editFerien.fahrer]} (${formatDate(editFerien.von_datum)} – ${formatDate(editFerien.bis_datum)}) wirklich entfernen?`}
              confirmLabel="Entfernen"
              onConfirm={() => {
                if (deleteId) {
                  deleteFerien.mutate(deleteId, {
                    onSuccess: () => {
                      toast.success('Ferien entfernt')
                      onClose()
                    },
                    onError: () => toast.error('Fehler beim Loeschen'),
                  })
                }
              }}
              onCancel={() => setDeleteId(null)}
              isPending={deleteFerien.isPending}
            />
          </>
        ) : (
          /* Create / Edit form */
          <form onSubmit={handleSubmit} className="space-y-3">
            {editFerien && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            )}

            {/* Person selector */}
            <div className="flex gap-2" role="radiogroup" aria-label="Person auswaehlen">
              {FAHRER.map(f => {
                const isSelected = fahrer === f
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFahrer(f)}
                    disabled={isPending}
                    role="radio"
                    aria-checked={isSelected}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg border-l-4 px-3 py-2.5 text-sm font-medium transition-all',
                      FAHRER_BORDER_FARBEN[f],
                      isSelected
                        ? 'bg-accent/10 text-accent shadow-sm ring-1 ring-accent/30'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
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

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ferien-von" className="mb-1.5 block text-xs font-medium text-muted-foreground">Von</label>
                <input
                  id="ferien-von"
                  type="date"
                  value={vonDatum}
                  onChange={e => {
                    setVonDatum(e.target.value)
                    if (!bisDatum || e.target.value > bisDatum) setBisDatum(e.target.value)
                  }}
                  disabled={isPending}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="ferien-bis" className="mb-1.5 block text-xs font-medium text-muted-foreground">Bis</label>
                <input
                  id="ferien-bis"
                  type="date"
                  value={bisDatum}
                  onChange={e => setBisDatum(e.target.value)}
                  min={vonDatum || undefined}
                  disabled={isPending}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
              </div>
            </div>

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
              disabled={isPending}
              className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {isPending ? 'Wird gespeichert...' : editFerien ? 'Speichern' : 'Ferien eintragen'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}

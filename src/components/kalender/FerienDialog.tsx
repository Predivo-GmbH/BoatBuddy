import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useFerien } from '@/hooks/useFerien'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, FAHRER_BORDER_FARBEN, type Fahrer } from '@/lib/fahrer'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { X, Trash2, Palmtree } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { todayISO } from '@/lib/format'

interface FerienDialogProps {
  onClose: () => void
}

export function FerienDialog({ onClose }: FerienDialogProps) {
  const [fahrer, setFahrer] = useState<Fahrer | ''>('')
  const [vonDatum, setVonDatum] = useState('')
  const [bisDatum, setBisDatum] = useState('')
  const [notiz, setNotiz] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { ferien, createFerien, deleteFerien } = useFerien()
  const trapRef = useFocusTrap<HTMLDivElement>(true)

  const isPending = createFerien.isPending || deleteFerien.isPending

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

  const today = todayISO()
  const upcoming = ferien.filter(f => f.bis_datum >= today)

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
          setFahrer('')
          setVonDatum('')
          setBisDatum('')
          setNotiz('')
        },
        onError: () => toast.error('Fehler beim Speichern'),
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
        aria-labelledby="ferien-dialog-title"
        className="mx-4 w-full max-w-sm origin-center animate-in zoom-in-95 fade-in space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="ferien-dialog-title" className="flex items-center gap-2 text-lg font-semibold">
            <Palmtree className="h-5 w-5 text-success" />
            Ferien eintragen
          </h2>
          <button
            onClick={close}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Schliessen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Existing upcoming vacations */}
        {upcoming.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Aktuelle & kommende Ferien
            </p>
            {upcoming.map(f => (
              <div
                key={f.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border-l-4 bg-muted px-3 py-2.5',
                  FAHRER_BORDER_FARBEN[f.fahrer],
                )}
              >
                <span className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white',
                      FAHRER_FARBEN[f.fahrer],
                    )}
                  >
                    {FAHRER_LABELS[f.fahrer].charAt(0)}
                  </span>
                  <span className="font-medium">{FAHRER_LABELS[f.fahrer]}</span>
                  <span className="text-muted-foreground">
                    {formatDate(f.von_datum)} – {formatDate(f.bis_datum)}
                  </span>
                </span>
                <button
                  onClick={() => setDeleteId(f.id)}
                  className="min-h-[44px] min-w-[44px] rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                  aria-label={`${FAHRER_LABELS[f.fahrer]} Ferien loeschen`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={deleteId !== null}
          title="Ferien entfernen?"
          description="Diese Ferienperiode wirklich entfernen?"
          confirmLabel="Entfernen"
          onConfirm={() => {
            if (deleteId) {
              deleteFerien.mutate(deleteId, {
                onSuccess: () => {
                  toast.success('Ferien entfernt')
                  setDeleteId(null)
                },
                onError: () => toast.error('Fehler beim Loeschen'),
              })
            }
          }}
          onCancel={() => setDeleteId(null)}
          isPending={deleteFerien.isPending}
        />

        {/* Add new */}
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Neue Ferien
          </p>

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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Von</label>
              <input
                type="date"
                value={vonDatum}
                onChange={e => {
                  setVonDatum(e.target.value)
                  if (!bisDatum || e.target.value > bisDatum) setBisDatum(e.target.value)
                }}
                disabled={isPending}
                className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bis</label>
              <input
                type="date"
                value={bisDatum}
                onChange={e => setBisDatum(e.target.value)}
                min={vonDatum || undefined}
                disabled={isPending}
                className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
          </div>

          {/* Notiz */}
          <input
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="Notiz (optional)"
            disabled={isPending}
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !fahrer || !vonDatum || !bisDatum}
            className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'Wird gespeichert...' : 'Ferien eintragen'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

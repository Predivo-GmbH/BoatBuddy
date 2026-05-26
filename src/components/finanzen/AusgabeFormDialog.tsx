import { useState, useEffect, useRef, useCallback } from 'react'
import { useAusgaben } from '@/hooks/useAusgaben'
import { KATEGORIEN, KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Ausgabe } from '@/types'

interface AusgabeFormDialogProps {
  editAusgabe?: Ausgabe | null
  onClose?: () => void
  autoOpen?: boolean
}

export function AusgabeFormDialog({ editAusgabe, onClose, autoOpen }: AusgabeFormDialogProps = {}) {
  const isEdit = !!editAusgabe
  const [open, setOpen] = useState(autoOpen ?? false)
  const [bezeichnung, setBezeichnung] = useState(editAusgabe?.bezeichnung ?? '')
  const [betrag, setBetrag] = useState(editAusgabe ? String(editAusgabe.betrag) : '')
  const [kategorie, setKategorie] = useState<Kategorie>(editAusgabe?.kategorie ?? 'sonstiges')
  const [datum, setDatum] = useState(editAusgabe?.datum ?? todayISO())
  const [notiz, setNotiz] = useState(editAusgabe?.notiz ?? '')
  const { createAusgabe, updateAusgabe } = useAusgaben()
  const overlayRef = useRef<HTMLDivElement>(null)

  const reset = () => {
    setBezeichnung('')
    setBetrag('')
    setKategorie('sonstiges')
    setDatum(todayISO())
    setNotiz('')
  }

  const close = useCallback(() => {
    reset()
    if (onClose) {
      onClose()
    } else {
      setOpen(false)
    }
  }, [onClose])

  // Close on Escape
  const isVisible = open || isEdit || !!onClose
  useEffect(() => {
    if (!isVisible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isVisible, close])

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) close()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const betragNum = parseFloat(betrag)
    if (!bezeichnung.trim() || isNaN(betragNum) || betragNum <= 0) {
      toast.error('Bitte alle Pflichtfelder ausfüllen')
      return
    }

    if (isEdit && editAusgabe) {
      updateAusgabe.mutate(
        { id: editAusgabe.id, bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum, notiz: notiz.trim() || undefined },
        {
          onSuccess: () => {
            toast.success('Ausgabe aktualisiert')
            close()
          },
          onError: () => toast.error('Fehler beim Aktualisieren'),
        },
      )
    } else {
      createAusgabe.mutate(
        { bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum, notiz: notiz.trim() || undefined },
        {
          onSuccess: () => {
            toast.success('Ausgabe gespeichert')
            close()
          },
          onError: () => toast.error('Fehler beim Speichern'),
        },
      )
    }
  }

  if (!isEdit && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent/90"
      >
        <Plus className="h-4 w-4" /> Neue Ausgabe
      </button>
    )
  }

  if (!isEdit && !open) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <form
        onSubmit={handleSubmit}
        className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl animate-in zoom-in-95 duration-200"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Bezeichnung *</label>
            <input
              value={bezeichnung}
              onChange={e => setBezeichnung(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="z.B. Winterservice"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Betrag (CHF) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={betrag}
                onChange={e => setBetrag(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Datum *</label>
              <input
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Kategorie</label>
            <select
              value={kategorie}
              onChange={e => setKategorie(e.target.value as Kategorie)}
              className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {KATEGORIEN.map(k => (
                <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notiz</label>
            <input
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isEdit ? updateAusgabe.isPending : createAusgabe.isPending}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {isEdit
              ? (updateAusgabe.isPending ? 'Aktualisieren...' : 'Aktualisieren')
              : (createAusgabe.isPending ? 'Speichern...' : 'Speichern')}
          </button>
        </div>
      </form>
    </div>
  )
}

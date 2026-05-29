import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAusgaben } from '@/hooks/useAusgaben'
import { FAHRER, FAHRER_LABELS, KATEGORIEN, KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Ausgabe } from '@/types'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const KATEGORIE_KEYWORDS: [Kategorie, string[]][] = [
  ['bootsplatz', ['bootsplatz', 'platz', 'hafen', 'liegeplatz']],
  ['versicherung', ['versicherung', 'axa', 'police', 'prämie']],
  ['verkehrssteuer', ['verkehrsamt', 'verkehrssteuer', 'steuer', 'wasserfzg', 'schifffahrt']],
  ['winterlager', ['winterlager', 'winter', 'einwintern']],
  ['fruehlingslager', ['frühlingslager', 'fruehlingslager', 'frühling', 'auswintern', 'mmc']],
  ['vorfuehren', ['vorführen', 'vorfuehren', 'kontrolle', 'schiffskontrolle', 'prüfung']],
  ['treibstoff', ['treibstoff', 'benzin', 'diesel', 'tanken', 'tankstelle']],
  ['material', ['material', 'blache', 'zubehör', 'ersatzteil']],
  ['reparatur', ['reparatur', 'reparieren', 'defekt', 'ersatz']],
  ['service', ['service', 'wartung', 'ölwechsel', 'werft']],
]

function suggestKategorie(text: string): Kategorie | null {
  const lower = text.toLowerCase()
  for (const [kat, keywords] of KATEGORIE_KEYWORDS) {
    if (keywords.some(kw => lower.includes(kw))) return kat
  }
  return null
}

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
  const [bezahltVon, setBezahltVon] = useState(editAusgabe?.bezahlt_von ?? 'bootkonto')
  const [notiz, setNotiz] = useState(editAusgabe?.notiz ?? '')
  const [kategorieManuallySet, setKategorieManuallySet] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsRef = useRef<HTMLUListElement>(null)
  const { ausgaben, createAusgabe, updateAusgabe } = useAusgaben()

  const pastBezeichnungen = useMemo(() => {
    const unique = [...new Set(ausgaben.map(a => a.bezeichnung))]
    unique.sort((a, b) => a.localeCompare(b))
    return unique
  }, [ausgaben])

  const filteredSuggestions = useMemo(() => {
    if (!bezeichnung.trim()) return []
    const q = bezeichnung.toLowerCase()
    return pastBezeichnungen.filter(b => b.toLowerCase().includes(q) && b !== bezeichnung)
  }, [bezeichnung, pastBezeichnungen])

  const isVisible = open || isEdit || !!onClose
  const isPending = isEdit ? updateAusgabe.isPending : createAusgabe.isPending
  const trapRef = useFocusTrap<HTMLDivElement>(isVisible)

  const reset = () => {
    setBezeichnung('')
    setBetrag('')
    setKategorie('sonstiges')
    setBezahltVon('bootkonto')
    setKategorieManuallySet(false)
    setDatum(todayISO())
    setNotiz('')
  }

  const close = useCallback(() => {
    if (isPending) return
    reset()
    if (onClose) {
      onClose()
    } else {
      setOpen(false)
    }
  }, [onClose, isPending])

  useEffect(() => {
    if (!isVisible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isVisible, close])

  const handleBezeichnungChange = (value: string) => {
    setBezeichnung(value)
    if (!isEdit && !kategorieManuallySet) {
      const suggested = suggestKategorie(value)
      setKategorie(suggested ?? 'sonstiges')
    }
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
        { id: editAusgabe.id, bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum, bezahlt_von: bezahltVon, notiz: notiz.trim() || undefined },
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
        { bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum, bezahlt_von: bezahltVon, notiz: notiz.trim() || undefined },
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

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) close() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ausgabe-dialog-title"
        onClick={e => e.stopPropagation()}
        className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl animate-in zoom-in-95 duration-200"
      >
        <form onSubmit={handleSubmit}>
          <fieldset disabled={isPending} className="contents">
            <div className="mb-6 flex items-center justify-between">
              <h2 id="ausgabe-dialog-title" className="text-lg font-semibold">{isEdit ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}</h2>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Schliessen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="mb-1.5 block text-sm font-medium">Bezeichnung *</label>
                <input
                  value={bezeichnung}
                  onChange={e => { handleBezeichnungChange(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => { setTimeout(() => setShowSuggestions(false), 150) }}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="z.B. Winterservice"
                  autoComplete="off"
                  autoFocus
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <ul
                    ref={suggestionsRef}
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
                  >
                    {filteredSuggestions.map(s => (
                      <li key={s}>
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleBezeichnungChange(s); setShowSuggestions(false) }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
                  onChange={e => { setKategorie(e.target.value as Kategorie); setKategorieManuallySet(true) }}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {KATEGORIEN.map(k => (
                    <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Bezahlt von</label>
                <select
                  value={bezahltVon}
                  onChange={e => setBezahltVon(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="bootkonto">Bootkonto</option>
                  {FAHRER.map(f => (
                    <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
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
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {isEdit
                  ? (updateAusgabe.isPending ? 'Aktualisieren...' : 'Aktualisieren')
                  : (createAusgabe.isPending ? 'Speichern...' : 'Speichern')}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>,
    document.body,
  )
}

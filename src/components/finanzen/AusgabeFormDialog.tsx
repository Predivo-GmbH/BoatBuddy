import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAusgaben } from '@/hooks/useAusgaben'
import { FAHRER, FAHRER_LABELS, KATEGORIEN, KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus, X, Upload, Camera, FileCheck } from 'lucide-react'
import { toast } from 'sonner'
import { uploadReceipt, extractFromStorage, validateReceiptFile, type ExtractedInvoice } from '@/lib/extractInvoice'
import { ExtractionProgress, type ExtractionState } from './ExtractionProgress'
import type { Ausgabe, ReceiptDraft } from '@/types'
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
  /** Receipt-upload review: force the user to explicitly pick who paid (no Bootkonto default). */
  forcePayerSelection?: boolean
  /**
   * An extracted receipt awaiting review. Held in memory — no ausgaben row
   * exists yet. When status is 'extracting' the dialog shows a loader; when it
   * flips to 'ready' the fields populate. Speichern is what finally inserts.
   */
  draft?: ReceiptDraft | null
}

export function AusgabeFormDialog({ editAusgabe, onClose, autoOpen, forcePayerSelection, draft }: AusgabeFormDialogProps = {}) {
  const isEdit = !!editAusgabe
  const draftData = draft?.status === 'ready' ? draft.data : undefined
  const [open, setOpen] = useState(autoOpen ?? false)
  const [bezeichnung, setBezeichnung] = useState(editAusgabe?.bezeichnung ?? draftData?.bezeichnung ?? '')
  const [betrag, setBetrag] = useState(editAusgabe ? String(editAusgabe.betrag) : (draftData?.betrag != null ? String(draftData.betrag) : ''))
  const [kategorie, setKategorie] = useState<Kategorie>(editAusgabe?.kategorie ?? draftData?.kategorie ?? 'sonstiges')
  const [datum, setDatum] = useState(editAusgabe?.datum ?? draftData?.datum ?? todayISO())
  const [liter, setLiter] = useState(
    editAusgabe?.treibstoff_liter != null ? String(editAusgabe.treibstoff_liter)
    : (draftData?.liter != null ? String(draftData.liter) : ''),
  )
  // Scanned receipts must not assume Bootkonto — start unselected and require a choice.
  const [bezahltVon, setBezahltVon] = useState(forcePayerSelection || draft ? '' : (editAusgabe?.bezahlt_von ?? 'bootkonto'))
  const [notiz, setNotiz] = useState(editAusgabe?.notiz ?? draftData?.notiz ?? '')
  const [kategorieManuallySet, setKategorieManuallySet] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionsRef = useRef<HTMLUListElement>(null)
  const { ausgaben, createAusgabe, updateAusgabe } = useAusgaben()

  // Beleg upload / photo capture (create mode) — uploads + extracts, then pre-fills
  // the form. NOTHING is written to the DB until Speichern; the uploaded file's
  // storage path is held here so the insert can link it.
  const [dokumentPfad, setDokumentPfad] = useState<string | null>(
    draft?.status === 'ready' ? draft.dokument_pfad : (draft?.status === 'error' ? draft.dokument_pfad : null),
  )
  const [uploadState, setUploadState] = useState<ExtractionState>('idle')
  const [uploadName, setUploadName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // Fields for a ready draft are seeded via the useState initializers above.
  // The parent remounts this dialog (via `key`) when the draft flips from
  // 'extracting' to 'ready', so no effect is needed to apply late results.
  // applyExtracted stays for the in-dialog upload flow (processFile).
  const applyExtracted = useCallback((a: ExtractedInvoice) => {
    if (a.bezeichnung) setBezeichnung(a.bezeichnung)
    if (a.betrag != null) setBetrag(String(a.betrag))
    if (a.datum) setDatum(a.datum)
    if (a.kategorie) setKategorie(a.kategorie)
    if (a.liter != null) setLiter(String(a.liter))
    if (a.notiz) setNotiz(a.notiz)
    setKategorieManuallySet(true)
  }, [])

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

  const isVisible = open || isEdit || !!onClose || !!draft
  const isUploadBusy = uploadState === 'uploading' || uploadState === 'extracting' || draft?.status === 'extracting'
  // Receipt-backed expenses (uploaded here, or opened for review) must have an
  // explicit payer — never silently 'bootkonto'.
  const requirePayer = forcePayerSelection || !!draft || !!dokumentPfad
  const isPending = createAusgabe.isPending || updateAusgabe.isPending
  const trapRef = useFocusTrap<HTMLDivElement>(isVisible)

  const reset = () => {
    setBezeichnung('')
    setBetrag('')
    setKategorie('sonstiges')
    setBezahltVon('bootkonto')
    setKategorieManuallySet(false)
    setDatum(todayISO())
    setLiter('')
    setNotiz('')
    setDokumentPfad(null)
    setUploadState('idle')
    setUploadName('')
  }

  const processFile = useCallback(async (file: File) => {
    const validationError = validateReceiptFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setUploadName(file.name)
    setUploadState('uploading')
    // A scanned receipt is usually paid privately — clear any payer so the user must choose.
    setBezahltVon('')
    try {
      // upload → then extract, flipping the loader between the two phases
      const storagePath = await uploadReceipt(file)
      setUploadState('extracting')
      const extracted = await extractFromStorage(storagePath)
      applyExtracted(extracted)
      setDokumentPfad(storagePath)
      setUploadState('done')
      toast.success('Beleg extrahiert — bitte prüfen und speichern')
    } catch (err) {
      setUploadState('error')
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    }
  }, [applyExtracted])

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    if (fileRef.current) fileRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }, [processFile])

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
    if (requirePayer && !bezahltVon) {
      toast.error('Bitte wählen, wer die Rechnung bezahlt hat')
      return
    }
    // Litres only apply to fuel receipts
    const literNum = kategorie === 'treibstoff' && liter.trim() ? parseFloat(liter) : null

    if (isEdit && editAusgabe) {
      updateAusgabe.mutate(
        { id: editAusgabe.id, bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum, bezahlt_von: bezahltVon, notiz: notiz.trim() || undefined, treibstoff_liter: literNum },
        {
          onSuccess: () => {
            toast.success('Ausgabe aktualisiert')
            close()
          },
          onError: () => toast.error('Fehler beim Aktualisieren'),
        },
      )
    } else {
      // Create — the ONLY point where a receipt upload becomes a real row. A
      // linked document (if any) is attached here; no row existed before.
      createAusgabe.mutate(
        {
          bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum,
          bezahlt_von: bezahltVon, notiz: notiz.trim() || undefined, treibstoff_liter: literNum,
          dokument_pfad: dokumentPfad ?? undefined,
          verarbeitungs_status: dokumentPfad ? 'fertig' : undefined,
        },
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

  if (!isEdit && !open && !draft && !onClose) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ausgabe-dialog-title"
        onClick={e => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in zoom-in-95 duration-200"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <fieldset disabled={isPending} className="contents">
            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 id="ausgabe-dialog-title" className="text-lg font-semibold">{isEdit ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}</h2>
                <button
                  type="button"
                  onClick={close}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Schliessen"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {!isEdit && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFilePick} className="hidden" aria-label="Beleg hochladen" />
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFilePick} className="hidden" aria-label="Foto aufnehmen" />
                    {isUploadBusy || uploadState === 'done' || uploadState === 'error' ? (
                      <ExtractionProgress
                        state={draft?.status === 'extracting' ? 'extracting' : uploadState}
                        fileName={uploadName}
                      />
                    ) : dokumentPfad ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <FileCheck className="h-4 w-4" /> Beleg angehängt — bitte Felder prüfen und speichern
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Upload className="h-4 w-4" /> Beleg hochladen
                          </button>
                          <button
                            type="button"
                            onClick={() => cameraRef.current?.click()}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Camera className="h-4 w-4" /> Foto aufnehmen
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">PDF, JPG, PNG oder WebP — Felder werden automatisch ausgefüllt</p>
                      </>
                    )}
                  </div>
                )}
                <div className="relative">
                  <label htmlFor="ausgabe-bezeichnung" className="mb-1.5 block text-sm font-medium">Bezeichnung *</label>
                  <input
                    id="ausgabe-bezeichnung"
                    value={bezeichnung}
                    onChange={e => { handleBezeichnungChange(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => { setTimeout(() => setShowSuggestions(false), 150) }}
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="z.B. Winterservice"
                    autoComplete="off"
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
                    <label htmlFor="ausgabe-betrag" className="mb-1.5 block text-sm font-medium">Betrag (CHF) *</label>
                    <input
                      id="ausgabe-betrag"
                      type="number"
                      step="0.01"
                      min="0"
                      value={betrag}
                      onChange={e => setBetrag(e.target.value)}
                      className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="ausgabe-datum" className="mb-1.5 block text-sm font-medium">Datum *</label>
                    <input
                      id="ausgabe-datum"
                      type="date"
                      value={datum}
                      onChange={e => setDatum(e.target.value)}
                      className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="ausgabe-kategorie" className="mb-1.5 block text-sm font-medium">Kategorie</label>
                  <select
                    id="ausgabe-kategorie"
                    value={kategorie}
                    onChange={e => { setKategorie(e.target.value as Kategorie); setKategorieManuallySet(true) }}
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {KATEGORIEN.map(k => (
                      <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                {kategorie === 'treibstoff' && (
                  <div>
                    <label htmlFor="ausgabe-liter" className="mb-1.5 block text-sm font-medium">Liter (Tankfüllung)</label>
                    <input
                      id="ausgabe-liter"
                      type="number"
                      step="0.01"
                      min="0"
                      value={liter}
                      onChange={e => setLiter(e.target.value)}
                      className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="z.B. 50.0 (von der Tank-Rechnung)"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="ausgabe-bezahlt-von" className="mb-1.5 block text-sm font-medium">
                    Bezahlt von {requirePayer && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="ausgabe-bezahlt-von"
                    value={bezahltVon}
                    onChange={e => setBezahltVon(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {(requirePayer || !bezahltVon) && <option value="" disabled>Bitte wählen…</option>}
                    <option value="bootkonto">Bootkonto</option>
                    {FAHRER.map(f => (
                      <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
                    ))}
                  </select>
                  {requirePayer && (
                    <p className="mt-1 text-xs text-muted-foreground">Beleg gescannt — meist privat bezahlt. Wer hat bezahlt?</p>
                  )}
                </div>
                <div>
                  <label htmlFor="ausgabe-notiz" className="mb-1.5 block text-sm font-medium">Notiz</label>
                  <input
                    id="ausgabe-notiz"
                    value={notiz}
                    onChange={e => setNotiz(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            {/* Sticky action bar — always reachable, even on short mobile viewports */}
            <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-card p-4">
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={isUploadBusy}
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

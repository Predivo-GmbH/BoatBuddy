import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAusgaben } from '@/hooks/useAusgaben'
import { FAHRER, FAHRER_LABELS, KATEGORIEN, KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus, X, Upload, Camera, Loader2, FileText, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Ausgabe } from '@/types'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
type UploadState = 'idle' | 'uploading' | 'extracting' | 'done' | 'error'

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
  const queryClient = useQueryClient()

  // Beleg upload / photo capture (create mode only) — uploads the receipt, runs AI
  // extraction, and pre-fills this form. The created row is linked so Speichern
  // updates it instead of creating a duplicate.
  const [linkedRowId, setLinkedRowId] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadName, setUploadName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

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
  const isUploadBusy = uploadState === 'uploading' || uploadState === 'extracting'
  const isPending = (isEdit || linkedRowId) ? updateAusgabe.isPending : createAusgabe.isPending
  const trapRef = useFocusTrap<HTMLDivElement>(isVisible)

  const reset = () => {
    setBezeichnung('')
    setBetrag('')
    setKategorie('sonstiges')
    setBezahltVon('bootkonto')
    setKategorieManuallySet(false)
    setDatum(todayISO())
    setNotiz('')
    setLinkedRowId(null)
    setUploadState('idle')
    setUploadName('')
  }

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Nur PDF, JPG, PNG oder WebP Dateien erlaubt')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Datei zu gross (max. 10 MB)')
      return
    }
    setUploadName(file.name)
    setUploadState('uploading')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const storagePath = `${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('dokumente').upload(storagePath, file, { contentType: file.type })
      if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)

      const { data: row, error: insertError } = await supabase
        .from('ausgaben')
        .insert({
          bezeichnung: 'Beleg-Upload',
          betrag: 0,
          kategorie: 'sonstiges',
          datum: todayISO(),
          bezahlt_von: bezahltVon,
          dokument_pfad: storagePath,
          verarbeitungs_status: 'verarbeitung',
        })
        .select().single()
      if (insertError || !row) throw new Error(`DB-Eintrag fehlgeschlagen: ${insertError?.message}`)
      setLinkedRowId(row.id)

      setUploadState('extracting')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      fetch(`${supabaseUrl}/functions/v1/extract-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
        body: JSON.stringify({ ausgabe_id: row.id, storage_path: storagePath }),
      }).catch(() => {}) // fire-and-forget; we poll for the result below

      const apply = (a: Ausgabe) => {
        if (a.bezeichnung && a.bezeichnung !== 'Beleg-Upload') setBezeichnung(a.bezeichnung)
        if (a.betrag) setBetrag(String(a.betrag))
        if (a.datum) setDatum(a.datum)
        if (a.kategorie) setKategorie(a.kategorie)
        if (a.notiz) setNotiz(a.notiz)
        setKategorieManuallySet(true)
      }

      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const { data: updated } = await supabase.from('ausgaben').select('*').eq('id', row.id).single()
        if (updated?.verarbeitungs_status === 'fertig') {
          apply(updated as Ausgabe)
          setUploadState('done')
          queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
          toast.success('Beleg extrahiert — bitte prüfen und speichern')
          return
        }
        if (updated?.verarbeitungs_status === 'fehler') {
          setUploadState('error')
          toast.error('AI-Extraktion fehlgeschlagen — bitte manuell ausfüllen')
          return
        }
      }
      setUploadState('error')
      toast.warning('Extraktion dauert länger als erwartet — bitte manuell ausfüllen')
    } catch (err) {
      setUploadState('error')
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    }
  }, [bezahltVon, queryClient])

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
    } else if (linkedRowId) {
      // A receipt was uploaded → update the row that the upload created (also
      // clears 'verarbeitung'/'fehler' status so it can't get stuck).
      updateAusgabe.mutate(
        { id: linkedRowId, bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum, bezahlt_von: bezahltVon, notiz: notiz.trim() || undefined, verarbeitungs_status: 'fertig' },
        {
          onSuccess: () => {
            toast.success('Ausgabe gespeichert')
            close()
          },
          onError: () => toast.error('Fehler beim Speichern'),
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
                  {uploadState === 'idle' || uploadState === 'done' || uploadState === 'error' ? (
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
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-accent">
                      {uploadState === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 animate-pulse" />}
                      <span className="font-medium">{uploadState === 'uploading' ? 'Hochladen...' : 'AI extrahiert Daten...'}</span>
                      <span className="truncate text-xs text-muted-foreground">{uploadName}</span>
                    </div>
                  )}
                  {uploadState === 'done' && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <CheckCircle className="h-3.5 w-3.5" /> Beleg extrahiert — bitte Felder prüfen und speichern
                    </p>
                  )}
                  {uploadState === 'idle' && (
                    <p className="mt-2 text-xs text-muted-foreground">PDF, JPG, PNG oder WebP — Felder werden automatisch ausgefüllt</p>
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
              <div>
                <label htmlFor="ausgabe-bezahlt-von" className="mb-1.5 block text-sm font-medium">Bezahlt von</label>
                <select
                  id="ausgabe-bezahlt-von"
                  value={bezahltVon}
                  onChange={e => setBezahltVon(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="bootkonto">Bootkonto</option>
                  {FAHRER.map(f => (
                    <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
                  ))}
                </select>
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
                disabled={isUploadBusy}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {isEdit
                  ? (updateAusgabe.isPending ? 'Aktualisieren...' : 'Aktualisieren')
                  : ((createAusgabe.isPending || updateAusgabe.isPending) ? 'Speichern...' : 'Speichern')}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>,
    document.body,
  )
}

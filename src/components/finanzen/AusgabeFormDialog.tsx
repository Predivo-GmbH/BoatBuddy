import { useState } from 'react'
import { useAusgaben } from '@/hooks/useAusgaben'
import { KATEGORIEN, KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'

export function AusgabeFormDialog() {
  const [open, setOpen] = useState(false)
  const [bezeichnung, setBezeichnung] = useState('')
  const [betrag, setBetrag] = useState('')
  const [kategorie, setKategorie] = useState<Kategorie>('sonstiges')
  const [datum, setDatum] = useState(todayISO())
  const [notiz, setNotiz] = useState('')
  const { createAusgabe } = useAusgaben()

  const reset = () => {
    setBezeichnung('')
    setBetrag('')
    setKategorie('sonstiges')
    setDatum(todayISO())
    setNotiz('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const betragNum = parseFloat(betrag)
    if (!bezeichnung.trim() || isNaN(betragNum) || betragNum <= 0) {
      toast.error('Bitte alle Pflichtfelder ausfullen')
      return
    }

    createAusgabe.mutate(
      { bezeichnung: bezeichnung.trim(), betrag: betragNum, kategorie, datum, notiz: notiz.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Ausgabe gespeichert')
          reset()
          setOpen(false)
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
      >
        <Plus className="h-4 w-4" /> Neue Ausgabe
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form
        onSubmit={handleSubmit}
        className="mx-4 w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Neue Ausgabe</h2>
          <button type="button" onClick={() => { reset(); setOpen(false) }} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Bezeichnung *</label>
            <input
              value={bezeichnung}
              onChange={e => setBezeichnung(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="z.B. Winterservice"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Betrag (CHF) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={betrag}
                onChange={e => setBetrag(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Datum *</label>
              <input
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Kategorie</label>
            <select
              value={kategorie}
              onChange={e => setKategorie(e.target.value as Kategorie)}
              className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {KATEGORIEN.map(k => (
                <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notiz</label>
            <input
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { reset(); setOpen(false) }}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={createAusgabe.isPending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {createAusgabe.isPending ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}

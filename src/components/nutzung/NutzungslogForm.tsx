import { useState } from 'react'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { FAHRER, FAHRER_LABELS, type Fahrer } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import type { Aktivitaet } from '@/types'
import { AktivitaetenEditor } from './AktivitaetenEditor'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

export function NutzungslogForm() {
  const [datum, setDatum] = useState(todayISO())
  const [fahrer, setFahrer] = useState<Fahrer>('roger')
  const [betriebsstunden, setBetriebsstunden] = useState('')
  const [treibstoffLiter, setTreibstoffLiter] = useState('')
  const [aktivitaeten, setAktivitaeten] = useState<Aktivitaet[]>([])
  const [notiz, setNotiz] = useState('')
  const { createNutzungslog } = useNutzungslogs()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const stunden = parseFloat(betriebsstunden)
    if (isNaN(stunden) || stunden <= 0) {
      toast.error('Bitte Betriebsstunden angeben')
      return
    }

    const liter = treibstoffLiter ? parseFloat(treibstoffLiter) : undefined

    createNutzungslog.mutate(
      {
        datum,
        fahrer,
        betriebsstunden: stunden,
        treibstoff_liter: liter,
        aktivitaeten,
        notiz: notiz.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Nutzungslog gespeichert')
          setBetriebsstunden('')
          setTreibstoffLiter('')
          setAktivitaeten([])
          setNotiz('')
          setDatum(todayISO())
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Neuen Eintrag erfassen</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Fahrer</label>
          <select
            value={fahrer}
            onChange={e => setFahrer(e.target.value as Fahrer)}
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {FAHRER.map(f => (
              <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Betriebsstunden *</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={betriebsstunden}
            onChange={e => setBetriebsstunden(e.target.value)}
            placeholder="z.B. 2.5"
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Treibstoff (Liter)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={treibstoffLiter}
            onChange={e => setTreibstoffLiter(e.target.value)}
            placeholder="Optional"
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Aktivitaten</label>
        <AktivitaetenEditor value={aktivitaeten} onChange={setAktivitaeten} />
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Notiz</label>
        <input
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder="Optional"
          className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={createNutzungslog.isPending}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Erfassen
        </button>
      </div>
    </form>
  )
}

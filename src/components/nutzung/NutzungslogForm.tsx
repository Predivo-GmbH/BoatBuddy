import { useState } from 'react'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { FAHRER, FAHRER_LABELS, type Fahrer } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import type { Aktivitaet } from '@/types'
import { AktivitaetenEditor } from './AktivitaetenEditor'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

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
    <form onSubmit={handleSubmit} className="card-premium rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Neuen Eintrag erfassen
      </h3>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Fahrer</label>
          <select
            value={fahrer}
            onChange={e => setFahrer(e.target.value as Fahrer)}
            className={inputClass}
          >
            {FAHRER.map(f => (
              <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Betriebsstunden *</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={betriebsstunden}
            onChange={e => setBetriebsstunden(e.target.value)}
            placeholder="z.B. 2.5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Treibstoff (Liter)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={treibstoffLiter}
            onChange={e => setTreibstoffLiter(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Aktivitaeten</label>
        <AktivitaetenEditor value={aktivitaeten} onChange={setAktivitaeten} />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notiz</label>
        <input
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder="Optional"
          className={inputClass}
        />
      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={createNutzungslog.isPending}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50 sm:w-auto"
        >
          {createNutzungslog.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Erfassen
        </button>
      </div>
    </form>
  )
}

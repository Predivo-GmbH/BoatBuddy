import { useState } from 'react'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER, FAHRER_LABELS, type Fahrer } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export function GastsessionForm() {
  const [gastName, setGastName] = useState('')
  const [betrag, setBetrag] = useState('25')
  const [bezahltAn, setBezahltAn] = useState<Fahrer>('roger')
  const [datum, setDatum] = useState(todayISO())
  const { createGastsession } = useGastsessions()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const betragNum = parseFloat(betrag)
    if (!gastName.trim() || isNaN(betragNum) || betragNum <= 0) {
      toast.error('Bitte Name und Betrag ausfuellen')
      return
    }

    createGastsession.mutate(
      { gast_name: gastName.trim(), betrag: betragNum, bezahlt_an: bezahltAn, datum },
      {
        onSuccess: () => {
          toast.success('Session gespeichert')
          setGastName('')
          setBetrag('25')
          setDatum(todayISO())
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card-premium rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Neue Session erfassen
      </h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Gast-Name *</label>
          <input
            value={gastName}
            onChange={e => setGastName(e.target.value)}
            placeholder="Name"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Betrag (CHF)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={betrag}
            onChange={e => setBetrag(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bezahlt an</label>
          <select
            value={bezahltAn}
            onChange={e => setBezahltAn(e.target.value as Fahrer)}
            className={inputClass}
          >
            {FAHRER.map(f => (
              <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={createGastsession.isPending}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50 sm:w-auto"
        >
          {createGastsession.isPending ? (
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

import { useState } from 'react'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER, FAHRER_LABELS, type Fahrer } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

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
      toast.error('Bitte Name und Betrag ausfullen')
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
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Neue Session erfassen</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Gast-Name *</label>
          <input
            value={gastName}
            onChange={e => setGastName(e.target.value)}
            placeholder="Name"
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Betrag (CHF)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={betrag}
            onChange={e => setBetrag(e.target.value)}
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Bezahlt an</label>
          <select
            value={bezahltAn}
            onChange={e => setBezahltAn(e.target.value as Fahrer)}
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {FAHRER.map(f => (
              <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={createGastsession.isPending}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Erfassen
          </button>
        </div>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { useKontostand } from '@/hooks/useKontostand'
import { formatCurrency, formatDate, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Wallet, Plus } from 'lucide-react'
import { toast } from 'sonner'

export function KontoBilanzCard() {
  const { latestKontostand, createSnapshot } = useKontostand()
  const [editing, setEditing] = useState(false)
  const [betrag, setBetrag] = useState('')
  const [datum, setDatum] = useState(todayISO())

  const isPositive = latestKontostand ? Number(latestKontostand.betrag) >= 0 : true

  const handleSave = () => {
    const betragNum = parseFloat(betrag)
    if (isNaN(betragNum)) {
      toast.error('Bitte gultigen Betrag eingeben')
      return
    }
    createSnapshot.mutate(
      { betrag: betragNum, datum },
      {
        onSuccess: () => {
          toast.success('Kontostand aktualisiert')
          setEditing(false)
          setBetrag('')
          setDatum(todayISO())
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  return (
    <div className={cn(
      'card-premium p-5',
      isPositive ? 'card-accent-top-success' : 'card-accent-top-destructive'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4" />
          Kontostand
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Kontostand aktualisieren"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className={cn(
        'mt-3 text-3xl font-bold tabular-nums',
        isPositive ? 'text-success' : 'text-destructive'
      )}>
        {latestKontostand ? formatCurrency(Number(latestKontostand.betrag)) : '--'}
      </p>
      {latestKontostand && (
        <p className="mt-1 text-xs text-muted-foreground">Stand: {formatDate(latestKontostand.datum)}</p>
      )}

      {editing && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <input
            type="number"
            step="0.01"
            value={betrag}
            onChange={e => setBetrag(e.target.value)}
            placeholder="Neuer Kontostand"
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleSave}
            disabled={createSnapshot.isPending}
            className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      )}
    </div>
  )
}

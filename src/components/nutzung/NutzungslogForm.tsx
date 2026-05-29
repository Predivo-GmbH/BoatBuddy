import { useState } from 'react'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { useBootStats } from '@/hooks/useBootStats'
import { FAHRER, FAHRER_LABELS, type Fahrer } from '@/lib/fahrer'
import { todayISO } from '@/lib/format'
import type { Aktivitaet } from '@/types'
import { AktivitaetenEditor } from './AktivitaetenEditor'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export function NutzungslogForm() {
  const [datum, setDatum] = useState(todayISO())
  const [fahrer, setFahrer] = useState<Fahrer | ''>('')
  const [neueStunden, setNeueStunden] = useState('')
  const [treibstoffLiter, setTreibstoffLiter] = useState('')
  const [aktivitaeten, setAktivitaeten] = useState<Aktivitaet[]>([])
  const [notiz, setNotiz] = useState('')
  const [expanded, setExpanded] = useState(false)
  const { createNutzungslog } = useNutzungslogs()
  const { stats } = useBootStats()

  const letzteGesamtstunden = stats ? Number(stats.gesamtstunden) : 0
  const neueTotal = parseFloat(neueStunden)
  const differenz = !isNaN(neueTotal) ? neueTotal - letzteGesamtstunden : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fahrer) {
      toast.error('Bitte einen Fahrer auswählen')
      return
    }
    if (isNaN(neueTotal) || neueTotal <= letzteGesamtstunden) {
      toast.error(`Neuer Stand muss grösser als ${letzteGesamtstunden} h sein`)
      return
    }

    const liter = treibstoffLiter ? parseFloat(treibstoffLiter) : undefined
    if (liter !== undefined && (isNaN(liter) || liter < 0)) {
      toast.error('Treibstoff darf nicht negativ sein')
      return
    }

    const delta = neueTotal - letzteGesamtstunden

    createNutzungslog.mutate(
      {
        datum,
        fahrer,
        betriebsstunden: delta,
        neue_gesamtstunden: neueTotal,
        treibstoff_liter: liter,
        aktivitaeten,
        notiz: notiz.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Eintrag gespeichert')
          setFahrer('')
          setNeueStunden('')
          setTreibstoffLiter('')
          setAktivitaeten([])
          setNotiz('')
          setDatum(todayISO())
          setExpanded(false)
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card-premium rounded-xl border border-border bg-card p-5 border-t-2 border-t-accent"
    >
    <fieldset disabled={createNutzungslog.isPending} className="contents">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Neuen Eintrag erfassen
      </h3>

      {/* Compact row: Date, Driver, Hours, Fuel, Toggle, Save */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[130px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="min-w-[120px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Fahrer</label>
          <select
            value={fahrer}
            onChange={e => setFahrer(e.target.value as Fahrer)}
            className={inputClass}
          >
            <option value="" disabled>Fahrer wählen</option>
            {FAHRER.map(f => (
              <option key={f} value={f}>{FAHRER_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Neuer Stand * <span className="text-muted-foreground/60">(Letzter: {letzteGesamtstunden} h)</span>
          </label>
          <input
            type="number"
            step="0.1"
            min={letzteGesamtstunden + 0.1}
            value={neueStunden}
            onChange={e => setNeueStunden(e.target.value)}
            placeholder={`z.B. ${(letzteGesamtstunden + 2.5).toFixed(1)}`}
            className={inputClass}
          />
          {differenz !== null && differenz > 0 && (
            <p className="mt-1 text-xs text-accent font-medium">+{differenz.toFixed(1)} h Differenz</p>
          )}
        </div>
        <div className="min-w-[120px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Treibstoff (L)</label>
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
        <div className="flex flex-shrink-0 items-end gap-2">
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            Erweitert
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="submit"
            disabled={createNutzungslog.isPending}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {createNutzungslog.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Erfassen
          </button>
        </div>
      </div>

      {/* Expanded section: Activities + Notes */}
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Aktivitäten</label>
            <AktivitaetenEditor value={aktivitaeten} onChange={setAktivitaeten} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notiz</label>
            <input
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
        </div>
      )}
    </fieldset>
    </form>
  )
}

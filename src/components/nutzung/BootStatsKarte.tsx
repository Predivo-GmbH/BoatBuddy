import { useState } from 'react'
import { useBootStats } from '@/hooks/useBootStats'
import { formatDate } from '@/lib/format'
import { Ship, Clock, Pencil, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const inputClass =
  'min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export function BootStatsKarte() {
  const { stats, isLoading, updateBootStats } = useBootStats()
  const [editing, setEditing] = useState(false)
  const [modell, setModell] = useState('')
  const [kaufdatum, setKaufdatum] = useState('')

  const startEditing = () => {
    if (!stats) return
    setModell(stats.modell ?? '')
    setKaufdatum(stats.kaufdatum ?? '')
    setEditing(true)
  }

  const saveEdits = () => {
    updateBootStats.mutate(
      {
        modell: modell.trim() || null,
        kaufdatum: kaufdatum || null,
      },
      {
        onSuccess: () => {
          toast.success('Boot-Daten aktualisiert')
          setEditing(false)
        },
        onError: () => toast.error('Fehler beim Speichern'),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="card-premium rounded-xl border border-border bg-card p-8 text-center">
        <Ship className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">Keine Boot-Statistiken vorhanden.</p>
      </div>
    )
  }

  return (
    <div className="card-premium rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Ship className="h-4 w-4" />
          Boot-Statistiken
        </h3>
        {editing ? (
          <button
            onClick={saveEdits}
            disabled={updateBootStats.isPending}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {updateBootStats.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Speichern
          </button>
        ) : (
          <button
            onClick={startEditing}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
            Bearbeiten
          </button>
        )}
      </div>

      {editing ? (
        <fieldset disabled={updateBootStats.isPending} className="contents">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Gesamtstunden</label>
            <p className="flex min-h-[44px] items-center text-xl font-bold tabular-nums">
              <Clock className="mr-1.5 h-4 w-4 text-muted-foreground" />
              {Number(stats.gesamtstunden)}h
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Modell</label>
            <input
              value={modell}
              onChange={e => setModell(e.target.value)}
              placeholder="z.B. Nautique G23"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Kaufdatum</label>
            <input
              type="date"
              value={kaufdatum}
              onChange={e => setKaufdatum(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        </fieldset>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Gesamtstunden</p>
            <p className="mt-1 flex items-center gap-1.5 text-xl sm:text-2xl font-bold tabular-nums text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {Number(stats.gesamtstunden)}h
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Modell</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{stats.modell ?? '-'}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Kaufdatum</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {stats.kaufdatum ? formatDate(stats.kaufdatum) : '-'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

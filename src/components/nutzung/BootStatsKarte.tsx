import { useState } from 'react'
import { useBootStats } from '@/hooks/useBootStats'
import { formatDate } from '@/lib/format'
import { Ship, Clock, Pencil, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function BootStatsKarte() {
  const { stats, isLoading, updateBootStats } = useBootStats()
  const [editing, setEditing] = useState(false)
  const [modell, setModell] = useState('')
  const [kaufdatum, setKaufdatum] = useState('')
  const [grenze, setGrenze] = useState('')

  const startEditing = () => {
    if (!stats) return
    setModell(stats.modell ?? '')
    setKaufdatum(stats.kaufdatum ?? '')
    setGrenze(stats.motorstunden_grenze?.toString() ?? '')
    setEditing(true)
  }

  const saveEdits = () => {
    const grenzeNum = grenze ? parseFloat(grenze) : null
    updateBootStats.mutate(
      {
        modell: modell.trim() || null,
        kaufdatum: kaufdatum || null,
        motorstunden_grenze: grenzeNum,
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
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!stats) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Keine Boot-Statistiken vorhanden.
      </div>
    )
  }

  const progressPercent = stats.motorstunden_grenze
    ? Math.min((stats.gesamtstunden / stats.motorstunden_grenze) * 100, 100)
    : null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Ship className="h-4 w-4" />
          Boot-Statistiken
        </h3>
        {editing ? (
          <button
            onClick={saveEdits}
            disabled={updateBootStats.isPending}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {updateBootStats.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Speichern
          </button>
        ) : (
          <button
            onClick={startEditing}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-input px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
            Bearbeiten
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Gesamtstunden</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xl font-bold">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {stats.gesamtstunden}h
          </p>
          {progressPercent !== null && (
            <div className="mt-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${progressPercent >= 90 ? 'bg-destructive' : 'bg-accent'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {Math.round(progressPercent)}% von {stats.motorstunden_grenze}h Service-Grenze
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">Modell</p>
          {editing ? (
            <input
              value={modell}
              onChange={e => setModell(e.target.value)}
              placeholder="z.B. Nautique G23"
              className="mt-0.5 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <p className="mt-0.5 text-lg font-semibold">{stats.modell ?? '-'}</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">Kaufdatum</p>
          {editing ? (
            <input
              type="date"
              value={kaufdatum}
              onChange={e => setKaufdatum(e.target.value)}
              className="mt-0.5 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <p className="mt-0.5 text-lg font-semibold">{stats.kaufdatum ? formatDate(stats.kaufdatum) : '-'}</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">Motorstunden-Grenze</p>
          {editing ? (
            <input
              type="number"
              min="0"
              value={grenze}
              onChange={e => setGrenze(e.target.value)}
              placeholder="z.B. 500"
              className="mt-0.5 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <p className="mt-0.5 text-lg font-semibold">
              {stats.motorstunden_grenze ? `${stats.motorstunden_grenze}h` : '-'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

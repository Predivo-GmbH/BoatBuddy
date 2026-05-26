import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, AKTIVITAET_LABELS, type AlleFahrer, type Fahrer, type AktivitaetTyp } from '@/lib/fahrer'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Aktivitaet, Nutzungslog } from '@/types'
import { Trash2, Loader2, Navigation, ArrowUpDown, ArrowUp, ArrowDown, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

type SortKey = 'datum' | 'betriebsstunden' | 'treibstoff_liter'
type SortDir = 'asc' | 'desc'

export function NutzungslogTabelle() {
  const { logs, isLoading, deleteNutzungslog, updateNutzungslog } = useNutzungslogs()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingLog, setEditingLog] = useState<Nutzungslog | null>(null)
  const [filterFahrer, setFilterFahrer] = useState<AlleFahrer | ''>('')
  const [filterYear, setFilterYear] = useState<string>(() => String(new Date().getFullYear()))
  const [sortKey, setSortKey] = useState<SortKey>('datum')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const availableYears = useMemo(() => {
    const years = [...new Set(logs.map(l => new Date(l.datum).getFullYear()))]
    years.sort((a, b) => b - a)
    return years
  }, [logs])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'datum' ? 'desc' : 'desc')
    }
  }

  const filtered = useMemo(() => {
    let items = [...logs]

    if (filterFahrer) {
      items = items.filter(l => l.fahrer === filterFahrer)
    }

    if (filterYear) {
      const year = Number(filterYear)
      items = items.filter(l => new Date(l.datum).getFullYear() === year)
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'datum') {
        cmp = a.datum.localeCompare(b.datum)
      } else if (sortKey === 'betriebsstunden') {
        cmp = a.betriebsstunden - b.betriebsstunden
      } else if (sortKey === 'treibstoff_liter') {
        cmp = (a.treibstoff_liter ?? 0) - (b.treibstoff_liter ?? 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return items
  }, [logs, filterFahrer, filterYear, sortKey, sortDir])

  const summary = useMemo(() => ({
    trips: filtered.length,
    hours: filtered.reduce((sum, l) => sum + l.betriebsstunden, 0),
    fuel: filtered.reduce((sum, l) => sum + (l.treibstoff_liter ?? 0), 0),
  }), [filtered])

  const sortIcon = (column: SortKey) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
      : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
  }

  const formatAktivitaeten = (aktivitaeten: Aktivitaet[]) =>
    aktivitaeten.map(a => `${AKTIVITAET_LABELS[a.typ as AktivitaetTyp] ?? a.typ} (${a.dauer_min}m)`).join(', ')

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="card-premium rounded-xl border border-border bg-card p-10 text-center">
        <Navigation className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Noch keine Nutzungslogs erfasst
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Erfasse oben deine erste Fahrt mit Betriebsstunden und Aktivitäten.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Driver filter pills */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterFahrer('')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filterFahrer === ''
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Alle
          </button>
          {FAHRER.map(f => (
            <button
              key={f}
              onClick={() => setFilterFahrer(filterFahrer === f ? '' : f)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filterFahrer === f
                  ? cn(FAHRER_FARBEN[f], 'text-white')
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {FAHRER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Year filter */}
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="min-h-[36px] w-full appearance-none rounded-lg border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:w-36"
        >
          <option value="">Alle Jahre</option>
          {availableYears.map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="table-premium w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th
                className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('datum')}
              >
                Datum {sortIcon('datum')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fahrer</th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('betriebsstunden')}
              >
                Stunden {sortIcon('betriebsstunden')}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('treibstoff_liter')}
              >
                Liter {sortIcon('treibstoff_liter')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aktivitäten</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notiz</th>
              <th className="w-10 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => (
              <tr key={log.id} className="row-accent border-b border-border/50 transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDate(log.datum)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-medium text-foreground">
                    <span className={cn('h-2 w-2 rounded-full', FAHRER_FARBEN[log.fahrer as AlleFahrer])} />
                    {FAHRER_LABELS[log.fahrer as AlleFahrer] ?? log.fahrer}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{log.betriebsstunden}h</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {log.treibstoff_liter != null ? `${log.treibstoff_liter}L` : '-'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {log.aktivitaeten.length > 0 ? formatAktivitaeten(log.aktivitaeten) : '-'}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                  {log.notiz ?? '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingLog(log)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
                      aria-label="Bearbeiten"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(log.id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Loeschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {/* Summary row */}
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {summary.trips} {summary.trips === 1 ? 'Fahrt' : 'Fahrten'}
              </td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                {summary.hours}h
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                {summary.fuel > 0 ? `${summary.fuel}L` : '-'}
              </td>
              <td className="px-4 py-3" colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onConfirm={() => {
          if (deleteId) {
            deleteNutzungslog.mutate(deleteId, {
              onSuccess: () => setDeleteId(null),
              onError: () => toast.error('Fehler'),
            })
          }
        }}
        onCancel={() => setDeleteId(null)}
        isPending={deleteNutzungslog.isPending}
      />

      {editingLog && (
        <NutzungslogEditDialog
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onSave={(fields) => {
            updateNutzungslog.mutate(
              { id: editingLog.id, ...fields },
              {
                onSuccess: () => {
                  toast.success('Eintrag aktualisiert')
                  setEditingLog(null)
                },
                onError: () => toast.error('Fehler beim Aktualisieren'),
              },
            )
          }}
          isPending={updateNutzungslog.isPending}
        />
      )}

      {/* Result count when filtered */}
      {(filterFahrer || filterYear) && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} von {logs.length} Einträgen angezeigt
        </p>
      )}
    </div>
  )
}

/* ── Inline edit dialog ── */

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

function NutzungslogEditDialog({
  log,
  onClose,
  onSave,
  isPending,
}: {
  log: Nutzungslog
  onClose: () => void
  onSave: (fields: { datum: string; fahrer: Fahrer; betriebsstunden: number; treibstoff_liter?: number; notiz?: string }) => void
  isPending: boolean
}) {
  const [datum, setDatum] = useState(log.datum)
  const [fahrer, setFahrer] = useState<Fahrer>(log.fahrer as Fahrer)
  const [betriebsstunden, setBetriebsstunden] = useState(String(log.betriebsstunden))
  const [treibstoffLiter, setTreibstoffLiter] = useState(log.treibstoff_liter != null ? String(log.treibstoff_liter) : '')
  const [notiz, setNotiz] = useState(log.notiz ?? '')
  const overlayRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [close])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const stunden = parseFloat(betriebsstunden)
    if (isNaN(stunden) || stunden <= 0) {
      toast.error('Bitte Betriebsstunden angeben')
      return
    }
    const liter = treibstoffLiter.trim() ? parseFloat(treibstoffLiter) : undefined
    onSave({
      datum,
      fahrer,
      betriebsstunden: stunden,
      treibstoff_liter: liter,
      notiz: notiz.trim() || undefined,
    })
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) close() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl animate-in zoom-in-95 duration-200"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Eintrag bearbeiten</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Datum *</label>
              <input
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Fahrer *</label>
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
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Betriebsstunden *</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={betriebsstunden}
                onChange={e => setBetriebsstunden(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Treibstoff (L)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={treibstoffLiter}
                onChange={e => setTreibstoffLiter(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notiz</label>
            <input
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              className={inputClass}
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
            disabled={isPending}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'Aktualisieren...' : 'Aktualisieren'}
          </button>
        </div>
      </form>
    </div>
  )
}

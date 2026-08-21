import { useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { useReservierungen } from '@/hooks/useReservierungen'
import { FAHRER, ALLE_FAHRER, FAHRER_LABELS, FAHRER_FARBEN, AKTIVITAET_LABELS, type AlleFahrer, type Fahrer, type AktivitaetTyp } from '@/lib/fahrer'
import { formatDate } from '@/lib/format'
import { reservierungLabel } from '@/lib/reservierung'
import { cn } from '@/lib/utils'
import type { Aktivitaet, Nutzungslog } from '@/types'
import { Trash2, Loader2, Navigation, ArrowUpDown, ArrowUp, ArrowDown, Pencil, X, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

type SortKey = 'datum' | 'betriebsstunden'
type SortDir = 'asc' | 'desc'

export function NutzungslogTabelle() {
  const { logs, isLoading, deleteNutzungslog, updateNutzungslog } = useNutzungslogs()
  const { reservierungen } = useReservierungen()
  const reservierungById = useMemo(
    () => new Map(reservierungen.map(r => [r.id, r])),
    [reservierungen],
  )
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingLog, setEditingLog] = useState<Nutzungslog | null>(null)
  const [filterFahrer, setFilterFahrer] = useState<AlleFahrer | ''>('')
  const [filterYear, setFilterYear] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('datum')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const availableYears = useMemo(() => {
    const years = [...new Set(logs.map(l => parseInt(l.datum.slice(0, 4), 10)))]
    years.sort((a, b) => b - a)
    return years
  }, [logs])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    let items = [...logs]

    if (filterFahrer) {
      items = items.filter(l => l.fahrer === filterFahrer)
    }

    if (filterYear) {
      items = items.filter(l => l.datum.startsWith(filterYear))
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'datum') {
        cmp = a.datum.localeCompare(b.datum)
      } else if (sortKey === 'betriebsstunden') {
        cmp = Number(a.betriebsstunden) - Number(b.betriebsstunden)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return items
  }, [logs, filterFahrer, filterYear, sortKey, sortDir])

  const summary = useMemo(() => ({
    trips: filtered.length,
    hours: filtered.reduce((sum, l) => sum + Number(l.betriebsstunden), 0),
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
            aria-pressed={filterFahrer === ''}
            className={cn(
              'min-h-[44px] rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filterFahrer === ''
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Alle
          </button>
          {ALLE_FAHRER.map(f => (
            <button
              key={f}
              onClick={() => setFilterFahrer(filterFahrer === f ? '' : f)}
              aria-pressed={filterFahrer === f}
              className={cn(
                'min-h-[44px] rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
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
          aria-label="Jahr filtern"
          className="min-h-[44px] w-full appearance-none rounded-lg border border-input bg-background px-3 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:w-36"
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
                scope="col"
                className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('datum')}
                aria-sort={sortKey === 'datum' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Datum {sortIcon('datum')}
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fahrer</th>
              <th
                scope="col"
                className="cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('betriebsstunden')}
                aria-sort={sortKey === 'betriebsstunden' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Stunden {sortIcon('betriebsstunden')}
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aktivitäten</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notiz</th>
              <th scope="col" className="w-10 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => (
              <tr key={log.id} className="row-accent border-b border-border/50 transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {formatDate(log.datum)}
                  {log.reservierung_id && reservierungById.has(log.reservierung_id) && (
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-accent">
                      <Clock className="h-3 w-3" />
                      {reservierungLabel(reservierungById.get(log.reservierung_id)!)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-medium text-foreground">
                    <span className={cn('h-2 w-2 rounded-full', FAHRER_FARBEN[log.fahrer as AlleFahrer])} />
                    {FAHRER_LABELS[log.fahrer as AlleFahrer] ?? log.fahrer}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{log.betriebsstunden}h</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {log.aktivitaeten && log.aktivitaeten.length > 0 ? formatAktivitaeten(log.aktivitaeten) : '-'}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                  {log.notiz ?? '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingLog(log)}
                      className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent flex items-center justify-center"
                      aria-label={`${formatDate(log.datum)} bearbeiten`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(log.id)}
                      className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                      aria-label={`${formatDate(log.datum)} löschen`}
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
              onSuccess: () => {
                toast.success('Eintrag gelöscht')
                setDeleteId(null)
              },
              onError: () => toast.error('Fehler beim Löschen'),
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

function NutzungslogEditDialog({
  log,
  onClose,
  onSave,
  isPending,
}: {
  log: Nutzungslog
  onClose: () => void
  onSave: (fields: { datum: string; fahrer: Fahrer; betriebsstunden: number; aktivitaeten: Aktivitaet[]; notiz?: string }) => void
  isPending: boolean
}) {
  const [datum, setDatum] = useState(log.datum)
  const [fahrer, setFahrer] = useState<Fahrer>(log.fahrer as Fahrer)
  const [betriebsstunden, setBetriebsstunden] = useState(String(log.betriebsstunden))
  const [notiz, setNotiz] = useState(log.notiz ?? '')
  const trapRef = useFocusTrap<HTMLDivElement>(true)

  const close = useCallback(() => {
    if (!isPending) onClose()
  }, [isPending, onClose])

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
    onSave({
      datum,
      fahrer,
      betriebsstunden: stunden,
      aktivitaeten: log.aktivitaeten ?? [],
      notiz: notiz.trim() || undefined,
    })
  }

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) close() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={trapRef}
        role="dialog"
        data-gate-a="NutzungslogTabelle"
        aria-modal="true"
        aria-labelledby="nutzungslog-edit-title"
        onClick={e => e.stopPropagation()}
        className="mx-4 w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl animate-in zoom-in-95 duration-200"
      >
        <form onSubmit={handleSubmit}>
          <fieldset disabled={isPending} className="contents">
            <div className="mb-6 flex items-center justify-between">
              <h2 id="nutzungslog-edit-title" className="text-lg font-semibold">Eintrag bearbeiten</h2>
              <button
                type="button"
                onClick={close}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Schliessen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-nutzung-datum" className="mb-1.5 block text-sm font-medium">Datum *</label>
                  <input
                    id="edit-nutzung-datum"
                    type="date"
                    value={datum}
                    onChange={e => setDatum(e.target.value)}
                    className={inputClass}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="edit-nutzung-fahrer" className="mb-1.5 block text-sm font-medium">Fahrer *</label>
                  <select
                    id="edit-nutzung-fahrer"
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
              <div>
                <label htmlFor="edit-nutzung-stunden" className="mb-1.5 block text-sm font-medium">Betriebsstunden *</label>
                <input
                  id="edit-nutzung-stunden"
                  type="number"
                  step="0.1"
                  min="0"
                  value={betriebsstunden}
                  onChange={e => setBetriebsstunden(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="edit-nutzung-notiz" className="mb-1.5 block text-sm font-medium">Notiz</label>
                <input
                  id="edit-nutzung-notiz"
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
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {isPending ? 'Aktualisieren...' : 'Aktualisieren'}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>,
    document.body,
  )
}

import { useMemo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER, FAHRER_LABELS, FAHRER_FARBEN, type Fahrer, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Trash2, Loader2, Search, Users, ArrowUpDown, ArrowUp, ArrowDown, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { Gastsession } from '@/types'

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

type SortKey = 'datum' | 'betrag'
type SortDir = 'asc' | 'desc'

export function GastsessionTabelle() {
  const { sessions, isLoading, deleteGastsession, updateGastsession } = useGastsessions()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingSession, setEditingSession] = useState<Gastsession | null>(null)
  const [search, setSearch] = useState('')
  const [filterFahrer, setFilterFahrer] = useState<Fahrer | ''>('')
  const [filterYear, setFilterYear] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('datum')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortIcon = (column: SortKey) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
      : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
  }

  const availableYears = useMemo(() => {
    return [...new Set(sessions.map(s => s.datum.slice(0, 4)))].sort((a, b) => b.localeCompare(a))
  }, [sessions])

  // Default to most recent year when no explicit selection
  const effectiveYear = filterYear === '' && availableYears.length > 0
    ? availableYears[0]
    : filterYear

  const filtered = useMemo(() => {
    let items = [...sessions]

    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(s => s.gast_name.toLowerCase().includes(q))
    }

    if (filterFahrer) {
      items = items.filter(s => s.bezahlt_an === filterFahrer)
    }

    if (effectiveYear && effectiveYear !== 'alle') {
      items = items.filter(s => s.datum.startsWith(effectiveYear))
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'datum') {
        cmp = a.datum.localeCompare(b.datum)
      } else if (sortKey === 'betrag') {
        cmp = Number(a.betrag) - Number(b.betrag)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return items
  }, [sessions, search, filterFahrer, effectiveYear, sortKey, sortDir])

  const totalBetrag = useMemo(() => filtered.reduce((sum, s) => sum + Number(s.betrag), 0), [filtered])

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="card-premium rounded-xl border border-border bg-card p-10 text-center">
        <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Noch keine Gast-Sessions erfasst
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Erfasse oben die erste Wakesurfen-Session mit deinen Gästen.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Gast suchen..."
              aria-label="Gast suchen"
              className="min-h-[44px] w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:max-w-xs"
            />
          </div>

          {/* Bezahlt an pills */}
          <div className="flex flex-wrap items-center gap-1.5">
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
                    ? `${FAHRER_FARBEN[f]} text-white`
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {FAHRER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Year pills */}
        {availableYears.length >= 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Jahr:</span>
            <button
              onClick={() => setFilterYear('alle')}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                effectiveYear === 'alle'
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Alle
            </button>
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setFilterYear(y)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  effectiveYear === y
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="table-premium w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th
                  className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  onClick={() => handleSort('datum')}
                  aria-sort={sortKey === 'datum' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Datum {sortIcon('datum')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gast</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bezahlt an</th>
                <th
                  className="cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  onClick={() => handleSort('betrag')}
                  aria-sort={sortKey === 'betrag' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Betrag {sortIcon('betrag')}
                </th>
                <th className="w-10 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="row-accent border-b border-border/50 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDate(s.datum)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{s.gast_name}</td>
                  <td className="px-4 py-3">{FAHRER_LABELS[s.bezahlt_an as AlleFahrer] ?? s.bezahlt_an}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                    {formatCurrency(Number(s.betrag))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingSession(s)}
                        className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent flex items-center justify-center"
                        aria-label={`${s.gast_name} bearbeiten`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(s.id)}
                        className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                        aria-label={`${s.gast_name} löschen`}
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
                <td className="px-4 py-3 text-xs font-medium text-muted-foreground" colSpan={3}>
                  {filtered.length} {filtered.length === 1 ? 'Session' : 'Sessions'}
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-foreground">
                  {formatCurrency(totalBetrag)}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {search ? `Kein Gast mit "${search}" gefunden.` : 'Keine Sessions für die ausgewählten Filter.'}
        </p>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onConfirm={() => {
          if (deleteId) {
            deleteGastsession.mutate(deleteId, {
              onSuccess: () => {
                toast.success('Session gelöscht')
                setDeleteId(null)
              },
              onError: () => toast.error('Fehler beim Löschen'),
            })
          }
        }}
        onCancel={() => setDeleteId(null)}
        isPending={deleteGastsession.isPending}
      />

      {editingSession && (
        <GastsessionEditDialog
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSave={(fields) => {
            updateGastsession.mutate(
              { id: editingSession.id, ...fields },
              {
                onSuccess: () => {
                  toast.success('Session aktualisiert')
                  setEditingSession(null)
                },
                onError: () => toast.error('Fehler beim Aktualisieren'),
              },
            )
          }}
          isPending={updateGastsession.isPending}
        />
      )}

    </div>
  )
}

/* ── Inline edit dialog ── */

function GastsessionEditDialog({
  session,
  onClose,
  onSave,
  isPending,
}: {
  session: Gastsession
  onClose: () => void
  onSave: (fields: { gast_name: string; betrag: number; bezahlt_an: Fahrer; datum: string }) => void
  isPending: boolean
}) {
  const [gastName, setGastName] = useState(session.gast_name)
  const [betrag, setBetrag] = useState(String(session.betrag))
  const [bezahltAn, setBezahltAn] = useState<Fahrer>(session.bezahlt_an as Fahrer)
  const [datum, setDatum] = useState(session.datum)
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
    const betragNum = parseFloat(betrag)
    if (!gastName.trim() || isNaN(betragNum) || betragNum <= 0) {
      toast.error('Bitte alle Pflichtfelder ausfüllen')
      return
    }
    onSave({ gast_name: gastName.trim(), betrag: betragNum, bezahlt_an: bezahltAn, datum })
  }

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) close() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gastsession-edit-title"
        onClick={e => e.stopPropagation()}
        className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl animate-in zoom-in-95 duration-200"
      >
        <form onSubmit={handleSubmit}>
          <fieldset disabled={isPending} className="contents">
            <div className="mb-6 flex items-center justify-between">
              <h2 id="gastsession-edit-title" className="text-lg font-semibold">Session bearbeiten</h2>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Schliessen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Gast-Name *</label>
                <input
                  value={gastName}
                  onChange={e => setGastName(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Betrag (CHF) *</label>
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
                  <label className="mb-1.5 block text-sm font-medium">Datum *</label>
                  <input
                    type="date"
                    value={datum}
                    onChange={e => setDatum(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Bezahlt an</label>
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

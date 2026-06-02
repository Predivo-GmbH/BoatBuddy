import { useState, useMemo } from 'react'
import { useAusgaben } from '@/hooks/useAusgaben'
import { KATEGORIEN, KATEGORIE_LABELS, FAHRER_LABELS, type Kategorie, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Trash2, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, Pencil, CheckCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AusgabeFormDialog } from './AusgabeFormDialog'
import type { Ausgabe } from '@/types'

const KATEGORIE_COLORS: Record<Kategorie, string> = {
  bootskauf: 'bg-[#7C3AED]/10 text-[#7C3AED]',
  bootsplatz: 'bg-[#0EA5E9]/10 text-[#0EA5E9]',
  versicherung: 'bg-[#2D9E6B]/10 text-[#2D9E6B]',
  verkehrssteuer: 'bg-[#F59E0B]/10 text-[#F59E0B]',
  winterlager: 'bg-[#6366F1]/10 text-[#6366F1]',
  fruehlingslager: 'bg-[#F472B6]/10 text-[#F472B6]',
  vorfuehren: 'bg-[#64748B]/10 text-[#64748B]',
  treibstoff: 'bg-[#E09B3D]/10 text-[#E09B3D]',
  material: 'bg-[#06B6D4]/10 text-[#06B6D4]',
  reparatur: 'bg-[#D93F3F]/10 text-[#D93F3F]',
  service: 'bg-[#0077B6]/10 text-[#0077B6]',
  sonstiges: 'bg-[#8AAEC6]/10 text-[#8AAEC6]',
}

type SortKey = 'datum' | 'betrag' | 'kategorie'
type SortDir = 'asc' | 'desc'

export function AusgabenTabelle() {
  const { ausgaben, isLoading, deleteAusgabe, updateAusgabe } = useAusgaben()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingAusgabe, setEditingAusgabe] = useState<Ausgabe | null>(null)
  const [search, setSearch] = useState('')
  const [filterKategorie, setFilterKategorie] = useState<Kategorie | ''>('')
  const [filterYear, setFilterYear] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('datum')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'betrag' ? 'desc' : 'asc')
    }
  }

  const filtered = useMemo(() => {
    let items = [...ausgaben]

    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(a => a.bezeichnung.toLowerCase().includes(q))
    }

    if (filterKategorie) {
      items = items.filter(a => a.kategorie === filterKategorie)
    }

    if (filterYear) {
      items = items.filter(a => a.datum.startsWith(filterYear))
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'datum') {
        cmp = a.datum.localeCompare(b.datum)
      } else if (sortKey === 'betrag') {
        cmp = Number(a.betrag) - Number(b.betrag)
      } else if (sortKey === 'kategorie') {
        const labelA = KATEGORIE_LABELS[a.kategorie as Kategorie] ?? a.kategorie
        const labelB = KATEGORIE_LABELS[b.kategorie as Kategorie] ?? b.kategorie
        cmp = labelA.localeCompare(labelB)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return items
  }, [ausgaben, search, filterKategorie, filterYear, sortKey, sortDir])

  const availableYears = useMemo(() => {
    const years = [...new Set(ausgaben.map(a => parseInt(a.datum.slice(0, 4), 10)))]
    years.sort((a, b) => b - a)
    return years
  }, [ausgaben])

  const sortIcon = (column: SortKey) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
      : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
  }

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (ausgaben.length === 0) {
    return (
      <div className="card-premium p-8 text-center text-sm text-muted-foreground">
        Noch keine Ausgaben erfasst. Klicke &quot;Neue Ausgabe&quot; um zu beginnen.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search + filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche nach Bezeichnung..."
            aria-label="Ausgaben durchsuchen"
            className="min-h-[44px] w-full rounded-lg border border-input bg-background pl-10 pr-3 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={filterKategorie}
            onChange={e => setFilterKategorie(e.target.value as Kategorie | '')}
            aria-label="Nach Kategorie filtern"
            className="min-h-[44px] w-full appearance-none rounded-lg border border-input bg-background pl-10 pr-8 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:w-48"
          >
            <option value="">Alle Kategorien</option>
            {KATEGORIEN.map(k => (
              <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          aria-label="Nach Jahr filtern"
          className="min-h-[44px] w-full appearance-none rounded-lg border border-input bg-background px-3 text-base sm:text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:w-36"
        >
          <option value="">Alle Jahre</option>
          {availableYears.map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="table-premium w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th
                scope="col"
                className="cursor-pointer select-none px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('datum')}
              >
                Datum {sortIcon('datum')}
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Bezeichnung</th>
              <th
                scope="col"
                className="cursor-pointer select-none px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('kategorie')}
              >
                Kategorie {sortIcon('kategorie')}
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Bezahlt von</th>
              <th
                scope="col"
                className="cursor-pointer select-none px-4 py-3 text-right font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('betrag')}
              >
                Betrag {sortIcon('betrag')}
              </th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
              <th scope="col" className="w-10 px-4 py-3 text-right font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="row-accent border-b border-border/50">
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(a.datum)}</td>
                <td className="px-4 py-3 font-medium">{a.bezeichnung}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-block rounded-full px-2.5 py-1 text-xs font-medium',
                    KATEGORIE_COLORS[a.kategorie as Kategorie] ?? 'bg-muted text-muted-foreground'
                  )}>
                    {KATEGORIE_LABELS[a.kategorie as Kategorie] ?? a.kategorie}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {a.bezahlt_von === 'bootkonto'
                    ? 'Bootkonto'
                    : FAHRER_LABELS[a.bezahlt_von as AlleFahrer] ?? a.bezahlt_von}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(Number(a.betrag))}</td>
                <td className="px-4 py-3 text-center">
                  {a.bezahlt_von !== 'bootkonto' && (
                    <button
                      onClick={() => {
                        const newErstattet = !a.erstattet
                        updateAusgabe.mutate(
                          { id: a.id, erstattet: newErstattet, erstattet_am: newErstattet ? new Date().toISOString().split('T')[0] : null },
                          {
                            onSuccess: () => toast.success(newErstattet ? 'Als erstattet markiert' : 'Erstattung zurückgesetzt'),
                            onError: () => toast.error('Fehler beim Aktualisieren'),
                          },
                        )
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        a.erstattet
                          ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                      )}
                      aria-label={a.erstattet ? 'Erstattung zurücksetzen' : 'Als erstattet markieren'}
                    >
                      {a.erstattet ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      {a.erstattet ? 'Erstattet' : 'Offen'}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingAusgabe(a)}
                      className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent flex items-center justify-center"
                      aria-label={`${a.bezeichnung} bearbeiten`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(a.id)}
                      className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                      aria-label={`${a.bezeichnung} löschen`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onConfirm={() => {
          if (deleteId) {
            deleteAusgabe.mutate(deleteId, {
              onSuccess: () => {
                toast.success('Ausgabe gelöscht')
                setDeleteId(null)
              },
              onError: () => toast.error('Fehler beim Löschen'),
            })
          }
        }}
        onCancel={() => setDeleteId(null)}
        isPending={deleteAusgabe.isPending}
      />

      {editingAusgabe && (
        <AusgabeFormDialog
          editAusgabe={editingAusgabe}
          onClose={() => setEditingAusgabe(null)}
        />
      )}

      {/* Result count */}
      {(search || filterKategorie || filterYear) && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} von {ausgaben.length} Ausgaben angezeigt
        </p>
      )}
    </div>
  )
}

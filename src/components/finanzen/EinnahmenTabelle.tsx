import { useState, useMemo } from 'react'
import { useBeitraege } from '@/hooks/useBeitraege'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER_LABELS, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, ChevronLeft, ChevronRight, Filter } from 'lucide-react'

type EinnahmeTyp = 'beitrag' | 'sonderzahlung' | 'gastsession'

interface EinnahmeRow {
  id: string
  datum: string
  bezeichnung: string
  typ: EinnahmeTyp
  person: string
  betrag: number
}

const TYP_LABELS: Record<EinnahmeTyp, string> = {
  beitrag: 'Beitrag',
  sonderzahlung: 'Sonderzahlung',
  gastsession: 'Gast-Session',
}

const TYP_COLORS: Record<EinnahmeTyp, string> = {
  beitrag: 'bg-success/10 text-success',
  sonderzahlung: 'bg-[#F59E0B]/10 text-[#F59E0B]',
  gastsession: 'bg-accent/10 text-accent',
}

type SortKey = 'datum' | 'betrag' | 'typ'
type SortDir = 'asc' | 'desc'

export function EinnahmenTabelle() {
  const currentYear = new Date().getFullYear()
  const [jahr, setJahr] = useState(currentYear)
  const { beitraege, isLoading: bLoading } = useBeitraege(jahr)
  const { sessions, isLoading: gLoading } = useGastsessions()
  const [sortKey, setSortKey] = useState<SortKey>('datum')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterTyp, setFilterTyp] = useState<EinnahmeTyp | ''>('')

  const isLoading = bLoading || gLoading

  const rows = useMemo(() => {
    const result: EinnahmeRow[] = []

    const standardBetrag = jahr <= 2023 ? 300 : 400
    for (const b of beitraege) {
      const isExtraordinary = Number(b.betrag) !== standardBetrag || !b.monat.endsWith('-01')
      result.push({
        id: `b-${b.id}`,
        datum: b.monat,
        bezeichnung: isExtraordinary
          ? `Sonderzahlung ${FAHRER_LABELS[b.fahrer] ?? b.fahrer}`
          : `Monatsbeitrag ${FAHRER_LABELS[b.fahrer] ?? b.fahrer}`,
        typ: isExtraordinary ? 'sonderzahlung' : 'beitrag',
        person: FAHRER_LABELS[b.fahrer as AlleFahrer] ?? b.fahrer,
        betrag: Number(b.betrag),
      })
    }

    const jahrStr = String(jahr)
    for (const s of sessions) {
      if (!s.auf_konto_eingezahlt) continue
      if (!s.datum.startsWith(jahrStr)) continue
      result.push({
        id: `g-${s.id}`,
        datum: s.datum,
        bezeichnung: `Gast-Session: ${s.gast_name}`,
        typ: 'gastsession',
        person: FAHRER_LABELS[s.bezahlt_an as AlleFahrer] ?? s.bezahlt_an,
        betrag: Number(s.betrag),
      })
    }

    return result
  }, [beitraege, sessions, jahr])

  const filtered = useMemo(() => {
    let items = [...rows]

    if (filterTyp) {
      items = items.filter(r => r.typ === filterTyp)
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'datum') {
        cmp = a.datum.localeCompare(b.datum)
      } else if (sortKey === 'betrag') {
        cmp = a.betrag - b.betrag
      } else if (sortKey === 'typ') {
        cmp = a.typ.localeCompare(b.typ)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return items
  }, [rows, filterTyp, sortKey, sortDir])

  const total = filtered.reduce((sum, r) => sum + r.betrag, 0)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'betrag' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (column: SortKey) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
      : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
  }

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-3">
      {/* Year selector + type filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setJahr(j => j - 1)}
            className="min-h-[44px] min-w-[44px] rounded-lg p-2 transition-colors hover:bg-muted flex items-center justify-center"
            aria-label="Vorjahr"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[4rem] text-center text-lg font-semibold tabular-nums">{jahr}</span>
          <button
            onClick={() => setJahr(j => j + 1)}
            className="min-h-[44px] min-w-[44px] rounded-lg p-2 transition-colors hover:bg-muted flex items-center justify-center"
            aria-label="Nächstes Jahr"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="relative sm:ml-auto">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={filterTyp}
            onChange={e => setFilterTyp(e.target.value as EinnahmeTyp | '')}
            aria-label="Nach Typ filtern"
            className="min-h-[44px] w-full appearance-none rounded-lg border border-input bg-background pl-10 pr-8 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:w-48"
          >
            <option value="">Alle Typen</option>
            <option value="beitrag">Beiträge</option>
            <option value="sonderzahlung">Sonderzahlungen</option>
            <option value="gastsession">Gast-Sessions</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-premium p-8 text-center text-sm text-muted-foreground">
          Noch keine Einnahmen für {jahr} vorhanden.
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="table-premium w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort('datum')}
                  >
                    Datum {sortIcon('datum')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bezeichnung</th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort('typ')}
                  >
                    Typ {sortIcon('typ')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Person</th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 text-right font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort('betrag')}
                  >
                    Betrag {sortIcon('betrag')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="row-accent border-b border-border/50">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(r.datum)}</td>
                    <td className="px-4 py-3 font-medium">{r.bezeichnung}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-block rounded-full px-2.5 py-1 text-xs font-medium',
                        TYP_COLORS[r.typ]
                      )}>
                        {TYP_LABELS[r.typ]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{r.person}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(r.betrag)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td colSpan={4} className="px-4 py-3 text-sm font-medium text-muted-foreground">
                    Total {filterTyp ? TYP_LABELS[filterTyp] : 'Einnahmen'} ({filtered.length} Posten)
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-success">
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

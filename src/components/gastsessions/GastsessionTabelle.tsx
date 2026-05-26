import { useMemo, useState } from 'react'
import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER_LABELS, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency, formatDate } from '@/lib/format'
import { Trash2, Loader2, Search, Users } from 'lucide-react'
import { toast } from 'sonner'

export function GastsessionTabelle() {
  const { sessions, isLoading, deleteGastsession } = useGastsessions()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(s => s.gast_name.toLowerCase().includes(q))
  }, [sessions, search])

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
          Erfasse oben die erste Wakesurfen-Session mit deinen Gasten.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Gast suchen..."
          className="min-h-[44px] w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="table-premium w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datum</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gast</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bezahlt an</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Betrag</th>
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
                  <button
                    onClick={() => deleteGastsession.mutate(s.id, { onError: () => toast.error('Fehler') })}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Loeschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {search && filtered.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Kein Gast mit "{search}" gefunden.
        </p>
      )}
    </div>
  )
}

import { useAusgaben } from '@/hooks/useAusgaben'
import { KATEGORIE_LABELS, type Kategorie } from '@/lib/fahrer'
import { formatCurrency, formatDate } from '@/lib/format'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const KATEGORIE_COLORS: Record<Kategorie, string> = {
  bootsplatz: 'bg-sky-500/10 text-sky-500',
  versicherung: 'bg-success/10 text-success',
  verkehrssteuer: 'bg-amber-500/10 text-amber-500',
  winterlager: 'bg-violet-500/10 text-violet-500',
  fruehlingslager: 'bg-emerald-500/10 text-emerald-500',
  vorfuehren: 'bg-slate-500/10 text-slate-500',
  treibstoff: 'bg-warning/10 text-warning',
  material: 'bg-cyan-500/10 text-cyan-500',
  reparatur: 'bg-destructive/10 text-destructive',
  service: 'bg-accent/10 text-accent',
  sonstiges: 'bg-muted text-muted-foreground',
}

export function AusgabenTabelle() {
  const { ausgaben, isLoading, deleteAusgabe } = useAusgaben()

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (ausgaben.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Noch keine Ausgaben erfasst. Klicke &quot;Neue Ausgabe&quot; um zu beginnen.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Datum</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Bezeichnung</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Kategorie</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Betrag</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-10"></th>
          </tr>
        </thead>
        <tbody>
          {ausgaben.map(a => (
            <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="px-4 py-2.5 text-muted-foreground">{formatDate(a.datum)}</td>
              <td className="px-4 py-2.5 font-medium">{a.bezeichnung}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${KATEGORIE_COLORS[a.kategorie as Kategorie] ?? ''}`}>
                  {KATEGORIE_LABELS[a.kategorie as Kategorie] ?? a.kategorie}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(Number(a.betrag))}</td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => deleteAusgabe.mutate(a.id, { onError: () => toast.error('Fehler beim Loschen') })}
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Loschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

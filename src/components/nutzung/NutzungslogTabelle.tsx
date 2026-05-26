import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { FAHRER_LABELS, FAHRER_FARBEN, AKTIVITAET_LABELS, type AlleFahrer, type AktivitaetTyp } from '@/lib/fahrer'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Aktivitaet } from '@/types'
import { Trash2, Loader2, Navigation } from 'lucide-react'
import { toast } from 'sonner'

export function NutzungslogTabelle() {
  const { logs, isLoading, deleteNutzungslog } = useNutzungslogs()

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
          Erfasse oben deine erste Fahrt mit Betriebsstunden und Aktivitaeten.
        </p>
      </div>
    )
  }

  const formatAktivitaeten = (aktivitaeten: Aktivitaet[]) =>
    aktivitaeten.map(a => `${AKTIVITAET_LABELS[a.typ as AktivitaetTyp] ?? a.typ} (${a.dauer_min}m)`).join(', ')

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="table-premium w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datum</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fahrer</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stunden</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Liter</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aktivitaeten</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notiz</th>
            <th className="w-10 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
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
                <button
                  onClick={() => deleteNutzungslog.mutate(log.id, { onError: () => toast.error('Fehler') })}
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
  )
}

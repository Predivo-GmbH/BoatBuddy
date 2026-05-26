import { useNutzungslogs } from '@/hooks/useNutzungslogs'
import { FAHRER_LABELS, AKTIVITAET_LABELS, type Fahrer, type AktivitaetTyp } from '@/lib/fahrer'
import { formatDate } from '@/lib/format'
import type { Aktivitaet } from '@/types'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function NutzungslogTabelle() {
  const { logs, isLoading, deleteNutzungslog } = useNutzungslogs()

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Noch keine Nutzungslogs erfasst.
      </div>
    )
  }

  const formatAktivitaeten = (aktivitaeten: Aktivitaet[]) =>
    aktivitaeten.map(a => AKTIVITAET_LABELS[a.typ as AktivitaetTyp] ?? a.typ).join(', ')

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Datum</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Fahrer</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Stunden</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Liter</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Aktivitaten</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Notiz</th>
            <th className="px-4 py-2.5 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="px-4 py-2.5 text-muted-foreground">{formatDate(log.datum)}</td>
              <td className="px-4 py-2.5 font-medium">{FAHRER_LABELS[log.fahrer as Fahrer] ?? log.fahrer}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{log.betriebsstunden}h</td>
              <td className="px-4 py-2.5 text-right">
                {log.treibstoff_liter != null ? `${log.treibstoff_liter}L` : '-'}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">
                {log.aktivitaeten.length > 0 ? formatAktivitaeten(log.aktivitaeten) : '-'}
              </td>
              <td className="max-w-[200px] truncate px-4 py-2.5 text-muted-foreground">
                {log.notiz ?? '-'}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => deleteNutzungslog.mutate(log.id, { onError: () => toast.error('Fehler') })}
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

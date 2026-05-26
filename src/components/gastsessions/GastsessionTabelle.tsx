import { useGastsessions } from '@/hooks/useGastsessions'
import { FAHRER_LABELS, type Fahrer } from '@/lib/fahrer'
import { formatCurrency, formatDate } from '@/lib/format'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function GastsessionTabelle() {
  const { sessions, isLoading, deleteGastsession } = useGastsessions()

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Noch keine Gast-Sessions erfasst.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Datum</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Gast</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Bezahlt an</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Betrag</th>
            <th className="px-4 py-2.5 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="px-4 py-2.5 text-muted-foreground">{formatDate(s.datum)}</td>
              <td className="px-4 py-2.5 font-medium">{s.gast_name}</td>
              <td className="px-4 py-2.5">{FAHRER_LABELS[s.bezahlt_an as Fahrer] ?? s.bezahlt_an}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(Number(s.betrag))}</td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => deleteGastsession.mutate(s.id, { onError: () => toast.error('Fehler') })}
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

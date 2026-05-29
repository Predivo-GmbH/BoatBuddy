import { useKontoberechnung } from '@/hooks/useKontoberechnung'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Wallet, Loader2 } from 'lucide-react'

export function KontoBilanzCard() {
  const { data, isLoading } = useKontoberechnung()

  const saldo = data?.saldo ?? 0
  const isPositive = saldo >= 0

  return (
    <div className={cn(
      'card-premium card-glow p-5',
      isPositive ? 'card-accent-top-success card-gradient-green' : 'card-accent-top-destructive card-gradient-red'
    )}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="h-4 w-4" />
        Kontostand (berechnet)
      </div>
      {isLoading ? (
        <div className="mt-3 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <p className={cn(
            'mt-3 text-2xl sm:text-3xl font-bold tabular-nums',
            isPositive ? 'text-success' : 'text-destructive'
          )}>
            {formatCurrency(saldo)}
          </p>
        </>
      )}
    </div>
  )
}

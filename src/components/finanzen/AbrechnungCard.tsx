import { useMemo } from 'react'
import { useAusgaben } from '@/hooks/useAusgaben'
import { useGastsessions } from '@/hooks/useGastsessions'
import { ALLE_FAHRER, FAHRER_LABELS, type AlleFahrer } from '@/lib/fahrer'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ArrowRight, AlertCircle } from 'lucide-react'

interface PersonBalance {
  offeneErstattungen: number // Roger owes this person (they paid out of pocket)
  offeneEinzahlungen: number // This person owes the bank (collected cash not deposited)
  netto: number // positive = Roger owes them, negative = they owe the bank
}

export function AbrechnungCard() {
  const { ausgaben } = useAusgaben()
  const { sessions } = useGastsessions()

  const balances = useMemo(() => {
    const result: Record<string, PersonBalance> = {}

    for (const f of ALLE_FAHRER) {
      result[f] = { offeneErstattungen: 0, offeneEinzahlungen: 0, netto: 0 }
    }

    // Open reimbursements: expenses paid by a person (not bootkonto), not yet reimbursed
    for (const a of ausgaben) {
      if (a.bezahlt_von !== 'bootkonto' && !a.erstattet) {
        const person = a.bezahlt_von as AlleFahrer
        if (result[person]) {
          result[person].offeneErstattungen += Number(a.betrag)
        }
      }
    }

    // Open deposits: guest session cash collected but not deposited to bank
    for (const s of sessions) {
      if (!s.auf_konto_eingezahlt) {
        const person = s.bezahlt_an as AlleFahrer
        if (result[person]) {
          result[person].offeneEinzahlungen += Number(s.betrag)
        }
      }
    }

    // Calculate net per person
    for (const f of ALLE_FAHRER) {
      // Positive = Roger/bank owes them (reimbursement due)
      // Negative = they owe the bank (cash not deposited)
      result[f].netto = result[f].offeneErstattungen - result[f].offeneEinzahlungen
    }

    return result
  }, [ausgaben, sessions])

  const hasOpenItems = ALLE_FAHRER.some(
    f => balances[f].offeneErstattungen > 0 || balances[f].offeneEinzahlungen > 0,
  )

  if (!hasOpenItems) {
    return (
      <div className="card-premium card-glow p-5">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Offene Abrechnungen</h3>
        <p className="text-sm text-muted-foreground">Keine offenen Posten — alles ausgeglichen.</p>
      </div>
    )
  }

  return (
    <div className="card-premium card-glow p-5">
      <div className="mb-4 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-muted-foreground">Offene Abrechnungen</h3>
      </div>

      <div className="space-y-3">
        {ALLE_FAHRER.map(f => {
          const b = balances[f]
          if (b.offeneErstattungen === 0 && b.offeneEinzahlungen === 0) return null

          return (
            <div key={f} className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-semibold">{FAHRER_LABELS[f]}</p>
              <div className="space-y-1.5">
                {b.offeneErstattungen > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Bootkonto</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{FAHRER_LABELS[f]}</span>
                    <span className={cn('ml-auto font-semibold tabular-nums text-amber-600')}>
                      {formatCurrency(b.offeneErstattungen)}
                    </span>
                    <span className="text-muted-foreground">offen</span>
                  </div>
                )}
                {b.offeneEinzahlungen > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{FAHRER_LABELS[f]}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Bootkonto</span>
                    <span className={cn('ml-auto font-semibold tabular-nums text-amber-600')}>
                      {formatCurrency(b.offeneEinzahlungen)}
                    </span>
                    <span className="text-muted-foreground">offen</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

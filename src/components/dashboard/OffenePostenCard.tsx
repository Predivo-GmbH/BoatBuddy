import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  ChevronRight,
  Loader2,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAusgaben } from '@/hooks/useAusgaben'
import { useGastsessions } from '@/hooks/useGastsessions'
import { formatCurrency, formatDate } from '@/lib/format'
import { FAHRER_LABELS, FAHRER_TEXT_FARBEN } from '@/lib/fahrer'
import type { AlleFahrer } from '@/lib/fahrer'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function OffenePostenCard() {
  const { ausgaben, updateAusgabe } = useAusgaben()
  const { sessions, updateGastsession } = useGastsessions()

  const [processingId, setProcessingId] = useState<string | null>(null)

  const offeneErstattungen = useMemo(() => {
    return ausgaben.filter(
      (a) => a.bezahlt_von !== 'bootkonto' && !a.erstattet,
    )
  }, [ausgaben])

  const offeneEinzahlungen = useMemo(() => {
    return sessions.filter((s) => !s.auf_konto_eingezahlt)
  }, [sessions])

  const totalCount = offeneErstattungen.length + offeneEinzahlungen.length

  const handleErstatten = (id: string) => {
    setProcessingId(id)
    updateAusgabe.mutate(
      { id, erstattet: true, erstattet_am: new Date().toISOString().split('T')[0] },
      {
        onSuccess: () => {
          toast.success('Als erstattet markiert')
          setProcessingId(null)
        },
        onError: () => {
          toast.error('Fehler beim Aktualisieren')
          setProcessingId(null)
        },
      },
    )
  }

  const handleEingezahlt = (id: string) => {
    setProcessingId(id)
    updateGastsession.mutate(
      { id, auf_konto_eingezahlt: true, eingezahlt_am: new Date().toISOString().split('T')[0] },
      {
        onSuccess: () => {
          toast.success('Als eingezahlt markiert')
          setProcessingId(null)
        },
        onError: () => {
          toast.error('Fehler beim Aktualisieren')
          setProcessingId(null)
        },
      },
    )
  }

  if (totalCount === 0) return null

  return (
    <div className="card-premium card-accent-top-warning rounded-xl border border-border bg-card p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-400" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Offene Posten
          </h2>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[11px] font-bold text-white">
            {totalCount}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {/* Open Reimbursements */}
        {offeneErstattungen.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/50 px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <ArrowRightLeft className="h-4 w-4 text-orange-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {a.bezeichnung}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(a.datum)} · Bezahlt von{' '}
                  <span className={cn('font-medium', FAHRER_TEXT_FARBEN[a.bezahlt_von as AlleFahrer])}>
                    {FAHRER_LABELS[a.bezahlt_von as AlleFahrer] ?? a.bezahlt_von}
                  </span>
                  {' '}· Erstattung offen
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(a.betrag)}
              </span>
              <button
                onClick={() => handleErstatten(a.id)}
                disabled={processingId === a.id}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                title="Als erstattet markieren"
              >
                {processingId === a.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Erstattet
              </button>
            </div>
          </div>
        ))}

        {/* Open Guest Session Deposits */}
        {offeneEinzahlungen.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/50 px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Users className="h-4 w-4 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {s.gast_name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(s.datum)} · Bezahlt an{' '}
                  <span className={cn('font-medium', FAHRER_TEXT_FARBEN[s.bezahlt_an as AlleFahrer])}>
                    {FAHRER_LABELS[s.bezahlt_an as AlleFahrer] ?? s.bezahlt_an}
                  </span>
                  {' '}· Einzahlung offen
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(s.betrag)}
              </span>
              <button
                onClick={() => handleEingezahlt(s.id)}
                disabled={processingId === s.id}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                title="Als eingezahlt markieren"
              >
                {processingId === s.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Eingezahlt
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-3 pt-3 border-t border-border/50">
        <Link
          to="/finanzen"
          className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5"
        >
          Finanzen <ChevronRight className="h-3 w-3" />
        </Link>
        <Link
          to="/gastsessions"
          className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5"
        >
          Gast-Sessions <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}

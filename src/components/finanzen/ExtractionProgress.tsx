import { Loader2, CheckCircle, AlertCircle, Upload, ScanText } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ExtractionState = 'idle' | 'uploading' | 'extracting' | 'done' | 'error'

const STEPS: { key: ExtractionState; label: string; icon: typeof Upload }[] = [
  { key: 'uploading', label: 'Hochladen', icon: Upload },
  { key: 'extracting', label: 'KI liest den Beleg', icon: ScanText },
  { key: 'done', label: 'Fertig', icon: CheckCircle },
]

const ORDER: Record<ExtractionState, number> = { idle: 0, uploading: 1, extracting: 2, done: 3, error: 2 }

interface ExtractionProgressProps {
  state: ExtractionState
  fileName?: string
  className?: string
}

/**
 * Staged progress indicator for the AI receipt extraction: Hochladen → KI liest
 * den Beleg → Fertig. Gives the user a visible sense of where the recognition
 * stands instead of a bare spinner.
 */
export function ExtractionProgress({ state, fileName, className }: ExtractionProgressProps) {
  if (state === 'idle') return null
  const current = ORDER[state]

  if (state === 'error') {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-destructive', className)}>
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">Beleg konnte nicht gelesen werden — bitte Felder manuell ausfüllen.</span>
      </div>
    )
  }

  const activeLabel =
    state === 'uploading' ? 'Beleg wird hochgeladen…'
    : state === 'extracting' ? 'KI liest den Beleg…'
    : 'Beleg erkannt'

  return (
    <div className={cn('space-y-2.5', className)} role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        {state === 'done'
          ? <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
          : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />}
        <span className={cn('font-medium', state === 'done' ? 'text-emerald-600' : 'text-accent')}>
          {activeLabel}
        </span>
        {fileName && <span className="truncate text-xs text-muted-foreground">{fileName}</span>}
      </div>

      {/* Step track */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, i) => {
          const stepIndex = i + 1
          const reached = current >= stepIndex
          const isActive = current === stepIndex && state !== 'done'
          return (
            <div key={step.key} className="flex flex-1 items-center gap-1.5">
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                    reached ? 'w-full bg-accent' : 'w-0',
                    state === 'done' && 'bg-emerald-500',
                    isActive && 'animate-pulse',
                  )}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        {STEPS.map((step, i) => {
          const stepIndex = i + 1
          const reached = current >= stepIndex
          return (
            <span
              key={step.key}
              className={cn(
                'transition-colors',
                reached && (state === 'done' ? 'text-emerald-600' : 'text-accent'),
                reached && 'font-medium',
              )}
            >
              {step.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

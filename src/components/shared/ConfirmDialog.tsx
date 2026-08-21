import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface ConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title?: string
  description?: string
  confirmLabel?: string
  isPending?: boolean
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title = 'Wirklich löschen?',
  description = 'Dieser Vorgang kann nicht rückgängig gemacht werden.',
  confirmLabel = 'Löschen',
  isPending = false,
}: ConfirmDialogProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, isPending, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        ref={trapRef}
        role="dialog"
        data-gate-a="ConfirmDialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="mx-4 w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain origin-center animate-in zoom-in-95 fade-in space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h2 id="confirm-dialog-title" className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex min-h-[44px] items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

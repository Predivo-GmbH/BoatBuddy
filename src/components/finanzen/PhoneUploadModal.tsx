import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Smartphone, Loader2, ScanText } from 'lucide-react'
import { usePhoneUpload } from '@/hooks/usePhoneUpload'
import type { ReceiptDraft } from '@/types'
import QRCode from 'qrcode'

interface PhoneUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired when the photo has been read by the AI — parent opens the review dialog. */
  onExtracted: (draft: ReceiptDraft) => void
}

export function PhoneUploadModal({ open, onOpenChange, onExtracted }: PhoneUploadModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)
  const backdropRef = useRef<HTMLDivElement>(null)

  // When the AI finishes reading the phone photo, hand the draft to the parent
  // (opens the review dialog) and close this modal.
  const handleExtracted = useCallback((draft: ReceiptDraft) => {
    onExtracted(draft)
    setQrDataUrl('')
    onOpenChange(false)
  }, [onExtracted, onOpenChange])

  const { session, isCreating, createSession, cancelSession } = usePhoneUpload({ onExtracted: handleExtracted })

  // Create session when modal opens
  useEffect(() => {
    if (open && !session) {
      createSession()
    }
  }, [open, session, createSession])

  // Generate QR code when session is created
  useEffect(() => {
    if (session?.uploadUrl) {
      QRCode.toDataURL(session.uploadUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#0C1B33', light: '#ffffff' },
      }).then(setQrDataUrl).catch(() => {})
    }
  }, [session?.uploadUrl])

  // Countdown timer
  useEffect(() => {
    if (!session?.expiresAt) return
    const tick = () => {
      const remaining = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        cancelSession()
        onOpenChange(false)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [session?.expiresAt, cancelSession, onOpenChange])

  const handleClose = useCallback(() => {
    cancelSession()
    setQrDataUrl('')
    onOpenChange(false)
  }, [cancelSession, onOpenChange])

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) handleClose()
  }, [handleClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, handleClose])

  if (!open) return null

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Handy-Upload"
    >
      <div className="relative mx-4 w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain rounded-xl bg-card p-6 shadow-xl border border-border">
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Schliessen"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-accent">
            <Smartphone className="h-5 w-5" />
            <h2 className="text-base font-semibold">Foto mit Handy</h2>
          </div>

          {isCreating && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Session wird erstellt...</p>
            </div>
          )}

          {session?.status === 'pending' && qrDataUrl && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Scanne den QR-Code mit deinem Handy, um ein Foto der Rechnung aufzunehmen.
              </p>
              <div className="rounded-lg border border-border bg-white p-2">
                <img src={qrDataUrl} alt="QR-Code für Handy-Upload" width={264} height={264} className="h-[264px] w-[264px]" />
              </div>
              <div className="flex items-center gap-2 text-sm tabular-nums">
                <span className="text-muted-foreground">Gültig für:</span>
                <span className={timeLeft < 60 ? 'font-semibold text-destructive' : 'font-medium text-foreground'}>
                  {minutes}:{seconds.toString().padStart(2, '0')}
                </span>
              </div>
            </>
          )}

          {session?.status === 'uploaded' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="relative">
                <ScanText className="h-12 w-12 text-accent" />
                <Loader2 className="absolute -right-1 -top-1 h-5 w-5 animate-spin text-accent" />
              </div>
              <p className="font-medium text-foreground">Foto empfangen!</p>
              <p className="text-sm text-muted-foreground">KI liest den Beleg…</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

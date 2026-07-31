import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { extractFromStorage } from '@/lib/extractInvoice'
import type { ReceiptDraft } from '@/types'

interface PhoneUploadSession {
  id: string
  token: string
  uploadUrl: string
  status: 'pending' | 'uploaded' | 'expired'
  storagePath: string | null
  expiresAt: Date
}

interface UsePhoneUploadOptions {
  /** Fired when the phone photo has been read by the AI. NOTHING is saved yet —
   *  the parent opens a review dialog and the row is inserted only on Speichern. */
  onExtracted?: (draft: ReceiptDraft) => void
}

export function usePhoneUpload({ onExtracted }: UsePhoneUploadOptions = {}) {
  const [session, setSession] = useState<PhoneUploadSession | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const processedRef = useRef(false)
  const onExtractedRef = useRef(onExtracted)
  useEffect(() => { onExtractedRef.current = onExtracted }, [onExtracted])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    stopPolling()
    cleanupChannel()
  }, [stopPolling, cleanupChannel])

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup])

  const processUpload = useCallback(async (storagePath: string) => {
    if (processedRef.current) return
    processedRef.current = true
    cleanup()

    // Show "photo received" in the modal while the AI reads it.
    setSession(prev => prev ? { ...prev, status: 'uploaded', storagePath } : null)

    try {
      const extracted = await extractFromStorage(storagePath)
      onExtractedRef.current?.({ status: 'ready', data: extracted, dokument_pfad: storagePath })
    } catch {
      onExtractedRef.current?.({ status: 'error', dokument_pfad: storagePath })
    }
  }, [cleanup])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startPolling = useCallback((sessionId: string, _sessionToken: string) => {
    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('phone_upload_sessions')
        .select('status, storage_path')
        .eq('id', sessionId)
        .single()

      if (data?.status === 'uploaded' && data.storage_path) {
        processUpload(data.storage_path)
      }
    }, 2000)
  }, [processUpload])

  const createSession = useCallback(async () => {
    setIsCreating(true)
    processedRef.current = false
    cleanup()

    try {
      // Generate random token
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

      const { data, error } = await supabase
        .from('phone_upload_sessions')
        .insert({
          token,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        })
        .select('id')
        .single()

      if (error || !data) throw error

      const uploadUrl = `${window.location.origin}/phone-upload?token=${token}`

      const newSession: PhoneUploadSession = {
        id: data.id,
        token,
        uploadUrl,
        status: 'pending',
        storagePath: null,
        expiresAt,
      }
      setSession(newSession)

      // Subscribe to realtime updates
      const channel = supabase
        .channel(`phone-upload-${data.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'phone_upload_sessions',
          filter: `id=eq.${data.id}`,
        }, (payload) => {
          const updated = payload.new as { status: string; storage_path: string | null }
          if (updated.status === 'uploaded' && updated.storage_path) {
            processUpload(updated.storage_path)
          }
        })
        .subscribe()

      channelRef.current = channel

      // Start polling as fallback
      startPolling(data.id, token)

      return newSession
    } catch {
      toast.error('Fehler beim Erstellen der Upload-Session')
      return null
    } finally {
      setIsCreating(false)
    }
  }, [cleanup, processUpload, startPolling])

  const cancelSession = useCallback(() => {
    cleanup()
    processedRef.current = false
    setSession(null)
  }, [cleanup])

  return {
    session,
    isCreating,
    createSession,
    cancelSession,
  }
}

import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface PhoneUploadSession {
  id: string
  token: string
  uploadUrl: string
  status: 'pending' | 'uploaded' | 'expired'
  storagePath: string | null
  expiresAt: Date
}

export function usePhoneUpload() {
  const [session, setSession] = useState<PhoneUploadSession | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const queryClient = useQueryClient()

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
    cleanup()

    // Create ausgabe from the uploaded photo
    const fileName = storagePath.split('/').pop() ?? 'photo.jpg'
    const { data: ausgabe, error } = await supabase
      .from('ausgaben')
      .insert({
        bezeichnung: 'Handy-Upload',
        betrag: 0,
        kategorie: 'sonstiges',
        datum: new Date().toISOString().split('T')[0],
        bezahlt_von: 'bootkonto',
        dokument_pfad: storagePath,
        verarbeitungs_status: 'verarbeitung',
      })
      .select()
      .single()

    if (error || !ausgabe) {
      toast.error('Fehler beim Erstellen des Eintrags')
      return
    }

    // Fire-and-forget AI extraction
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    fetch(`${supabaseUrl}/functions/v1/extract-expense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        ausgabe_id: ausgabe.id,
        storage_path: storagePath,
      }),
    }).catch(() => {})

    queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
    queryClient.invalidateQueries({ queryKey: ['kontoberechnung'] })
    toast.success('Foto empfangen — KI-Extraktion läuft')

    setSession(prev => prev ? { ...prev, status: 'uploaded', storagePath } : null)

    return ausgabe
  }, [cleanup, queryClient])

  const startPolling = useCallback((sessionId: string, sessionToken: string) => {
    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('phone_upload_sessions')
        .select('status, storage_path')
        .eq('id', sessionId)
        .single()

      if (data?.status === 'uploaded' && data.storage_path) {
        stopPolling()
        cleanupChannel()
        processUpload(data.storage_path)
      }
    }, 2000)
  }, [stopPolling, cleanupChannel, processUpload])

  const createSession = useCallback(async () => {
    setIsCreating(true)
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
    setSession(null)
  }, [cleanup])

  return {
    session,
    isCreating,
    createSession,
    cancelSession,
  }
}

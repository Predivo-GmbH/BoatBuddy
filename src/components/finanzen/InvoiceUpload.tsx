import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Ausgabe } from '@/types'

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

type UploadState = 'idle' | 'uploading' | 'extracting' | 'done' | 'error'

interface InvoiceUploadProps {
  onExtracted: (ausgabe: Ausgabe) => void
}

export function InvoiceUpload({ onExtracted }: InvoiceUploadProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Nur PDF, JPG, PNG oder WebP Dateien erlaubt')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Datei zu gross (max. 10 MB)')
      return
    }

    setFileName(file.name)
    setState('uploading')

    try {
      // 1. Upload to Supabase Storage
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const storagePath = `${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('dokumente')
        .upload(storagePath, file, { contentType: file.type })

      if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)

      // 2. Create ausgaben record with verarbeitungs_status
      const { data: ausgabe, error: insertError } = await supabase
        .from('ausgaben')
        .insert({
          bezeichnung: file.name.replace(/\.[^.]+$/, ''),
          betrag: 0,
          kategorie: 'sonstiges',
          datum: new Date().toISOString().split('T')[0],
          bezahlt_von: 'bootkonto',
          dokument_pfad: storagePath,
          verarbeitungs_status: 'verarbeitung',
        })
        .select()
        .single()

      if (insertError || !ausgabe) throw new Error(`DB-Eintrag fehlgeschlagen: ${insertError?.message}`)

      // 3. Fire-and-forget call to extract-expense edge function
      setState('extracting')
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
      }).catch(() => {
        // Fire and forget — we poll for status
      })

      // 4. Poll for completion (every 3s, max 60s)
      const maxAttempts = 20
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 3000))

        const { data: updated } = await supabase
          .from('ausgaben')
          .select('*')
          .eq('id', ausgabe.id)
          .single()

        if (updated?.verarbeitungs_status === 'fertig') {
          setState('done')
          queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
          toast.success('Rechnung erfolgreich extrahiert')
          onExtracted(updated as Ausgabe)
          setTimeout(() => setState('idle'), 2000)
          return
        }

        if (updated?.verarbeitungs_status === 'fehler') {
          throw new Error('AI-Extraktion fehlgeschlagen')
        }
      }

      // Timeout — extraction took too long, still open the form with what we have
      const { data: final } = await supabase
        .from('ausgaben')
        .select('*')
        .eq('id', ausgabe.id)
        .single()

      queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
      if (final) {
        toast.warning('Extraktion dauert länger als erwartet. Du kannst die Daten manuell eingeben.')
        onExtracted(final as Ausgabe)
      }
      setState('idle')
    } catch (err) {
      setState('error')
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      setTimeout(() => setState('idle'), 3000)
    }
  }, [onExtracted, queryClient])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    if (fileRef.current) fileRef.current.value = ''
  }, [processFile])

  const isProcessing = state === 'uploading' || state === 'extracting'

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && fileRef.current?.click()}
      className={cn(
        'relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        dragOver && 'border-accent bg-accent/5',
        state === 'idle' && !dragOver && 'border-border hover:border-accent/50 hover:bg-muted/50',
        state === 'done' && 'border-emerald-500/50 bg-emerald-500/5',
        state === 'error' && 'border-destructive/50 bg-destructive/5',
        isProcessing && 'pointer-events-none border-accent/50 bg-accent/5',
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Rechnung hochladen"
      />

      {state === 'idle' && (
        <>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Rechnung hochladen</p>
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG oder WebP — max. 10 MB</p>
          </div>
        </>
      )}

      {state === 'uploading' && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <div>
            <p className="text-sm font-medium">Hochladen...</p>
            <p className="text-xs text-muted-foreground">{fileName}</p>
          </div>
        </>
      )}

      {state === 'extracting' && (
        <>
          <FileText className="h-8 w-8 animate-pulse text-accent" />
          <div>
            <p className="text-sm font-medium">AI extrahiert Daten...</p>
            <p className="text-xs text-muted-foreground">{fileName}</p>
          </div>
        </>
      )}

      {state === 'done' && (
        <>
          <CheckCircle className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-600">Erfolgreich extrahiert</p>
        </>
      )}

      {state === 'error' && (
        <>
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">Fehler bei der Extraktion</p>
        </>
      )}
    </div>
  )
}

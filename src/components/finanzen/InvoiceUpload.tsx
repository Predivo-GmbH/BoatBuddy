import { useState, useRef, useCallback } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { uploadReceipt, extractFromStorage, validateReceiptFile } from '@/lib/extractInvoice'
import { ExtractionProgress, type ExtractionState } from './ExtractionProgress'
import type { ReceiptDraft } from '@/types'

interface InvoiceUploadProps {
  /** Called with the in-memory draft to review. NOTHING is saved until Speichern. */
  onExtracted: (draft: ReceiptDraft) => void
}

export function InvoiceUpload({ onExtracted }: InvoiceUploadProps) {
  const [state, setState] = useState<ExtractionState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    const validationError = validateReceiptFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setFileName(file.name)
    setState('uploading')

    let storagePath: string | null = null
    try {
      storagePath = await uploadReceipt(file)
      setState('extracting')
      const extracted = await extractFromStorage(storagePath)
      setState('done')
      onExtracted({ status: 'ready', data: extracted, dokument_pfad: storagePath })
      setTimeout(() => setState('idle'), 1500)
    } catch (err) {
      setState('error')
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      // If the file made it to storage, still let the user save it manually.
      if (storagePath) onExtracted({ status: 'error', dokument_pfad: storagePath })
      setTimeout(() => setState('idle'), 3000)
    }
  }, [onExtracted])

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

      {state !== 'idle' && (
        <ExtractionProgress state={state} fileName={fileName} className="w-full max-w-xs text-left" />
      )}
    </div>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Camera, CheckCircle, AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { BoatIcon } from '@/components/shared/BoatIcon'

type PageState = 'validating' | 'invalid' | 'ready' | 'preview' | 'uploading' | 'success'

const MAX_DIMENSION = 2048

function enhanceImage(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Histogram-based contrast stretch
  const histogram = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    histogram[brightness]++
  }
  const totalPixels = canvas.width * canvas.height
  const clipLow = totalPixels * 0.01
  const clipHigh = totalPixels * 0.99
  let cumulative = 0
  let low = 0
  let high = 255
  for (let i = 0; i < 256; i++) {
    cumulative += histogram[i]
    if (cumulative >= clipLow && low === 0) low = i
    if (cumulative >= clipHigh) { high = i; break }
  }
  const range = Math.max(high - low, 1)

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = ((data[i + c] - low) / range) * 255
      v = Math.min(255, Math.max(0, v * 1.08)) // slight brightness boost
      data[i + c] = v
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

export default function PhoneUploadPage() {
  const [state, setState] = useState<PageState>('validating')
  const [token, setToken] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Validate token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (!urlToken) { setState('invalid'); return }

    supabase
      .from('phone_upload_sessions')
      .select('id, status, expires_at')
      .eq('token', urlToken)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setState('invalid')
        } else {
          setToken(urlToken)
          setState('ready')
        }
      })
  }, [])

  // Auto-open camera when ready
  useEffect(() => {
    if (state === 'ready') {
      setTimeout(() => fileRef.current?.click(), 200)
    }
  }, [state])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''

    // Process image: resize + enhance
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.src = objectUrl

    await new Promise<void>((resolve) => { img.onload = () => resolve() })
    URL.revokeObjectURL(objectUrl)

    let w = img.width
    let h = img.height
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    enhanceImage(canvas)

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92)
    })

    setCapturedBlob(blob)
    setPreviewUrl(URL.createObjectURL(blob))
    setState('preview')
  }, [])

  const handleUpload = useCallback(async () => {
    if (!capturedBlob || !token) return
    setState('uploading')

    try {
      const storagePath = `phone-uploads/${token}/photo.jpg`

      const { error: uploadError } = await supabase.storage
        .from('dokumente')
        .upload(storagePath, capturedBlob, { contentType: 'image/jpeg', upsert: false })

      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('phone_upload_sessions')
        .update({
          status: 'uploaded',
          storage_path: storagePath,
          uploaded_at: new Date().toISOString(),
        })
        .eq('token', token)

      if (updateError) throw updateError

      setState('success')
    } catch {
      setState('preview') // allow retry
    }
  }, [capturedBlob, token])

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setCapturedBlob(null)
    setPreviewUrl('')
    setState('ready')
  }, [previewUrl])

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <BoatIcon className="h-6 w-6 text-[#0077B6]" />
        <span className="text-lg font-bold text-[#0C1B33]">BoatBuddy</span>
      </div>

      <div className="w-full max-w-sm">
        {state === 'validating' && (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-[#0077B6]" />
            <p className="text-sm text-slate-600">Session wird überprüft...</p>
          </div>
        )}

        {state === 'invalid' && (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 shadow-sm">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-center font-medium text-slate-900">Session ungültig oder abgelaufen</p>
            <p className="text-center text-sm text-slate-500">
              Bitte scanne den QR-Code auf dem Desktop erneut.
            </p>
          </div>
        )}

        {state === 'ready' && (
          <div className="flex flex-col items-center gap-4 rounded-xl bg-white p-8 shadow-sm">
            <Camera className="h-12 w-12 text-[#0077B6]" />
            <p className="text-center font-medium text-slate-900">Rechnung fotografieren</p>
            <p className="text-center text-sm text-slate-500">
              Halte die Kamera über die Rechnung und mache ein Foto.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full rounded-lg bg-[#0077B6] px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-[#006299]"
            >
              Kamera öffnen
            </button>
          </div>
        )}

        {state === 'preview' && previewUrl && (
          <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm">
            <img
              src={previewUrl}
              alt="Vorschau"
              className="w-full rounded-lg border border-slate-200"
            />
            <div className="flex gap-2">
              <button
                onClick={handleRetake}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 active:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" />
                Nochmal
              </button>
              <button
                onClick={handleUpload}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0077B6] px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-[#006299]"
              >
                Hochladen
              </button>
            </div>
          </div>
        )}

        {state === 'uploading' && (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-[#0077B6]" />
            <p className="text-sm font-medium text-slate-900">Wird hochgeladen...</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 shadow-sm">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <p className="text-center font-medium text-slate-900">Foto erfolgreich hochgeladen!</p>
            <p className="text-center text-sm text-slate-500">
              Du kannst dieses Fenster jetzt schliessen.
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Rechnung fotografieren"
      />
    </div>
  )
}

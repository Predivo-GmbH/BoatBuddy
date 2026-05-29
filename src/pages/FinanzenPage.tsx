import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { KontoBilanzCard } from '@/components/finanzen/KontoBilanzCard'
import { MonatsdiagrammChart } from '@/components/finanzen/MonatsdiagrammChart'
import { KategorieChart } from '@/components/finanzen/KategorieChart'
import { AusgabenTabelle } from '@/components/finanzen/AusgabenTabelle'
import { AusgabeFormDialog } from '@/components/finanzen/AusgabeFormDialog'
import { InvoiceUpload } from '@/components/finanzen/InvoiceUpload'
import { PhoneUploadModal } from '@/components/finanzen/PhoneUploadModal'
import { BeitraegeGrid } from '@/components/finanzen/BeitraegeGrid'
import { EinnahmenTabelle } from '@/components/finanzen/EinnahmenTabelle'
import { AbrechnungCard } from '@/components/finanzen/AbrechnungCard'
import { useAusgaben } from '@/hooks/useAusgaben'
import { useBeitraege } from '@/hooks/useBeitraege'
import { useTabKeyboard } from '@/hooks/useTabKeyboard'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DollarSign, Wallet, Camera, Smartphone } from 'lucide-react'
import type { Ausgabe } from '@/types'

const TABS = ['Übersicht', 'Ausgaben', 'Einnahmen'] as const
type Tab = typeof TABS[number]

export default function FinanzenPage() {
  const [tab, setTab] = useState<Tab>('Übersicht')
  const [extractedAusgabe, setExtractedAusgabe] = useState<Ausgabe | null>(null)
  const [phoneUploadOpen, setPhoneUploadOpen] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const tabKeyDown = useTabKeyboard(TABS, tab, setTab)
  const currentYear = new Date().getFullYear()
  const { ausgaben } = useAusgaben()
  const { beitraege } = useBeitraege(currentYear)

  const ausgabenYear = useMemo(() => {
    const filtered = ausgaben.filter(a => a.datum.startsWith(String(currentYear)))
    return {
      total: filtered.reduce((sum, a) => sum + Number(a.betrag), 0),
      count: filtered.length,
    }
  }, [ausgaben, currentYear])

  const beitraegeYear = useMemo(() => ({
    total: beitraege.reduce((sum, b) => sum + Number(b.betrag), 0),
    months: new Set(beitraege.filter(b => b.monat.endsWith('-01')).map(b => b.monat.slice(0, 7))).size,
  }), [beitraege])

  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const updateIndicator = () => {
      const idx = TABS.indexOf(tab)
      const el = tabsRef.current[idx]
      if (el) {
        setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth })
      }
    }
    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [tab])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  const handleMobileCameraCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (!file) return

    try {
      toast.info('Foto wird hochgeladen...')
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const storagePath = `${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('dokumente')
        .upload(storagePath, file, { contentType: file.type })
      if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)

      const { data: ausgabe, error: insertError } = await supabase
        .from('ausgaben')
        .insert({
          bezeichnung: 'Handy-Foto',
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

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      fetch(`${supabaseUrl}/functions/v1/extract-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
        body: JSON.stringify({ ausgabe_id: ausgabe.id, storage_path: storagePath }),
      }).catch(() => {})

      queryClient.invalidateQueries({ queryKey: ['ausgaben'] })
      queryClient.invalidateQueries({ queryKey: ['kontoberechnung'] })
      toast.success('Foto hochgeladen — KI-Extraktion läuft')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    }
  }, [queryClient])

  const handlePhotoClick = useCallback(() => {
    if (isMobile) {
      cameraInputRef.current?.click()
    } else {
      setPhoneUploadOpen(true)
    }
  }, [isMobile])

  return (
    <>
      <PageHeader title="Finanzen" subtitle="Kontostand, Ausgaben & Beiträge" />

      {/* Pill-style tab navigation with animated indicator */}
      <div className="relative mb-6 flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Finanzen-Tabs">
        <div
          className="absolute top-1 bottom-1 rounded-lg bg-card shadow-sm border border-border transition-all duration-300 ease-out"
          style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        />
        {TABS.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            ref={el => { tabsRef.current[i] = el }}
            onClick={() => setTab(t)}
            onKeyDown={tabKeyDown}
            className={cn(
              'relative z-10 flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t
                ? 'text-accent font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Übersicht' && (
        <div className="space-y-6 slide-up">
          <div className="grid gap-4 md:grid-cols-3 slide-up-stagger">
            <KontoBilanzCard />
            <div className="card-premium card-glow card-gradient-red p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                Ausgaben {currentYear}
              </div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
                {formatCurrency(ausgabenYear.total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ausgabenYear.count} {ausgabenYear.count === 1 ? 'Ausgabe' : 'Ausgaben'}
              </p>
            </div>
            <div className="card-premium card-glow card-gradient-blue p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                Beiträge {currentYear}
              </div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
                {formatCurrency(beitraegeYear.total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {beitraegeYear.months} {beitraegeYear.months === 1 ? 'Monat' : 'Monate'} bezahlt
              </p>
            </div>
          </div>

          <AbrechnungCard />

          <div className="grid gap-6 lg:grid-cols-2 slide-up-stagger">
            <div className="card-premium card-glow p-5">
              <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Einnahmen vs. Ausgaben</h3>
              <MonatsdiagrammChart />
            </div>
            <div className="card-premium card-glow p-5">
              <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Ausgaben nach Kategorie</h3>
              <KategorieChart />
            </div>
          </div>
        </div>
      )}

      {tab === 'Ausgaben' && (
        <div className="section-fade-in space-y-4">
          <InvoiceUpload onExtracted={setExtractedAusgabe} />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleMobileCameraCapture}
            className="hidden"
            aria-label="Foto aufnehmen"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handlePhotoClick}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-input px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {isMobile ? <Camera className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              {isMobile ? 'Foto aufnehmen' : 'Foto mit Handy'}
            </button>
            <AusgabeFormDialog />
          </div>
          <PhoneUploadModal open={phoneUploadOpen} onOpenChange={setPhoneUploadOpen} />
          <AusgabenTabelle />
          {extractedAusgabe && (
            <AusgabeFormDialog
              editAusgabe={extractedAusgabe}
              onClose={() => setExtractedAusgabe(null)}
            />
          )}
        </div>
      )}

      {tab === 'Einnahmen' && (
        <div className="section-fade-in space-y-6">
          <div className="card-premium p-5">
            <BeitraegeGrid />
          </div>
          <div className="card-premium p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Alle Einnahmen aufs Konto
            </h3>
            <EinnahmenTabelle />
          </div>
        </div>
      )}
    </>
  )
}

import { useState, useRef, useEffect } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { KontoBilanzCard } from '@/components/finanzen/KontoBilanzCard'
import { MonatsdiagrammChart } from '@/components/finanzen/MonatsdiagrammChart'
import { KategorieChart } from '@/components/finanzen/KategorieChart'
import { AusgabenTabelle } from '@/components/finanzen/AusgabenTabelle'
import { AusgabeFormDialog } from '@/components/finanzen/AusgabeFormDialog'
import { BeitraegeGrid } from '@/components/finanzen/BeitraegeGrid'
import { cn } from '@/lib/utils'

const TABS = ['Ubersicht', 'Ausgaben', 'Beitrage'] as const
type Tab = typeof TABS[number]

export default function FinanzenPage() {
  const [tab, setTab] = useState<Tab>('Ubersicht')
  const jahr = new Date().getFullYear()
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const idx = TABS.indexOf(tab)
    const el = tabsRef.current[idx]
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth })
    }
  }, [tab])

  return (
    <>
      <PageHeader title="Finanzen" />

      {/* Pill-style tab navigation with animated indicator */}
      <div className="relative mb-6 flex gap-1 rounded-xl bg-muted p-1">
        <div
          className="absolute top-1 bottom-1 rounded-lg bg-card shadow-sm transition-all duration-300 ease-out"
          style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        />
        {TABS.map((t, i) => (
          <button
            key={t}
            ref={el => { tabsRef.current[i] = el }}
            onClick={() => setTab(t)}
            className={cn(
              'relative z-10 flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ubersicht' && (
        <div className="section-fade-in space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <KontoBilanzCard />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card-premium p-5">
              <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Einnahmen vs. Ausgaben</h3>
              <MonatsdiagrammChart jahr={jahr} />
            </div>
            <div className="card-premium p-5">
              <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Ausgaben nach Kategorie</h3>
              <KategorieChart />
            </div>
          </div>
        </div>
      )}

      {tab === 'Ausgaben' && (
        <div className="section-fade-in space-y-4">
          <div className="flex justify-end">
            <AusgabeFormDialog />
          </div>
          <AusgabenTabelle />
        </div>
      )}

      {tab === 'Beitrage' && (
        <div className="section-fade-in">
          <div className="card-premium p-5">
            <BeitraegeGrid />
          </div>
        </div>
      )}
    </>
  )
}

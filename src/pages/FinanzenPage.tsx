import { useState } from 'react'
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

  return (
    <>
      <PageHeader title="Finanzen" />

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ubersicht' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <KontoBilanzCard />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Einnahmen vs. Ausgaben</h3>
              <MonatsdiagrammChart jahr={jahr} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Ausgaben nach Kategorie</h3>
              <KategorieChart />
            </div>
          </div>
        </div>
      )}

      {tab === 'Ausgaben' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <AusgabeFormDialog />
          </div>
          <AusgabenTabelle />
        </div>
      )}

      {tab === 'Beitrage' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <BeitraegeGrid />
        </div>
      )}
    </>
  )
}

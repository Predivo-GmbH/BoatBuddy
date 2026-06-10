import { Link } from 'react-router-dom'
import { ChevronRight, Sparkles, Wrench, Bug, Database } from 'lucide-react'
import { useChangelog } from '@/hooks/useChangelog'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const KATEGORIE_CONFIG = {
  neu: { label: 'Neu', icon: Sparkles, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  verbesserung: { label: 'Update', icon: Wrench, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  fix: { label: 'Fix', icon: Bug, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  daten: { label: 'Daten', icon: Database, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
} as const

export function NeuigkeitenCard() {
  const { entries, isLoading } = useChangelog()

  if (isLoading || entries.length === 0) return null

  const recent = entries.slice(0, 3)

  return (
    <div className="card-premium card-glow rounded-xl border border-border bg-card p-5 mb-6 stagger-child" style={{ '--stagger': 1 } as React.CSSProperties}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Neuigkeiten
        </h2>
        <Link
          to="/neuigkeiten"
          className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5"
        >
          Alle anzeigen <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-3">
          {recent.map((entry) => {
            const config = KATEGORIE_CONFIG[entry.kategorie as keyof typeof KATEGORIE_CONFIG] ?? KATEGORIE_CONFIG.neu
            const Icon = config.icon
            return (
              <div key={entry.id} className="flex gap-3 relative">
                {/* Timeline dot */}
                <div className="relative z-10 mt-1 flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-full bg-card border-2 border-accent">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', config.color)}>
                      <Icon className="h-3 w-3" />
                      {config.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{formatDate(entry.datum)}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-0.5">{entry.titel}</p>
                  {entry.beschreibung && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.beschreibung}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

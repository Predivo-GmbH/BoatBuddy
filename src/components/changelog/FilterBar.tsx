import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Check, Minus, Sparkles, Wrench, Bug, Database } from 'lucide-react'
import type { ChangelogEntry } from '@/types'
import { CategoryPill } from './CategoryPill'

const KATEGORIE_CONFIG = {
  neu: { label: 'Neu', icon: Sparkles, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  verbesserung: { label: 'Update', icon: Wrench, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  fix: { label: 'Fix', icon: Bug, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  daten: { label: 'Daten', icon: Database, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
} as const

type Kategorie = keyof typeof KATEGORIE_CONFIG

interface FilterBarProps {
  entries: ChangelogEntry[]
  selectedCategories: Set<Kategorie>
  onSelectedCategoriesChange: (categories: Set<Kategorie>) => void
  isSticky?: boolean
}

export function FilterBar({ entries, selectedCategories, onSelectedCategoriesChange, isSticky = false }: FilterBarProps) {
  // Count entries by category
  const categoryCounts = useMemo(() => {
    const counts: Record<Kategorie, number> = { neu: 0, verbesserung: 0, fix: 0, daten: 0 }
    for (const entry of entries) {
      const cat = entry.kategorie as Kategorie
      if (cat in counts) counts[cat]++
    }
    return counts
  }, [entries])

  const handleToggleCategory = (kategorie: Kategorie) => {
    const next = new Set(selectedCategories)
    if (next.has(kategorie)) {
      next.delete(kategorie)
    } else {
      next.add(kategorie)
    }
    onSelectedCategoriesChange(next)
  }

  const handleToggleAll = () => {
    const allKategorien: Kategorie[] = ['neu', 'verbesserung', 'fix', 'daten']
    const allSelected = allKategorien.every(k => selectedCategories.has(k))

    if (allSelected) {
      onSelectedCategoriesChange(new Set())
    } else {
      onSelectedCategoriesChange(new Set(allKategorien))
    }
  }

  const allKategorien: Kategorie[] = ['neu', 'verbesserung', 'fix', 'daten']
  const allSelected = allKategorien.every(k => selectedCategories.has(k))
  const someSelected = selectedCategories.size > 0 && !allSelected

  return (
    <div
      className={cn(
        'flex flex-col gap-3 bg-background/95 backdrop-blur-sm px-4 py-4 rounded-lg border border-border/50 mb-6 transition-all duration-200 shadow-sm',
        isSticky && 'sticky top-4 z-40'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* "Alle Kategorien" button */}
        <button
          onClick={handleToggleAll}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 font-semibold transition-all duration-150',
            allSelected
              ? 'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90'
              : someSelected
                ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {allSelected ? <Check className="h-4 w-4" /> : someSelected ? <Minus className="h-4 w-4" /> : null}
          <span>Alle Kategorien</span>
        </button>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          {allKategorien.map(kategorie => {
            const config = KATEGORIE_CONFIG[kategorie]

            return (
              <CategoryPill
                key={kategorie}
                label={config.label}
                icon={config.icon}
                isSelected={selectedCategories.has(kategorie)}
                count={categoryCounts[kategorie]}
                color={config.color}
                onClick={() => handleToggleCategory(kategorie)}
              />
            )
          })}
        </div>
      </div>

      {/* No filters selected message */}
      {selectedCategories.size === 0 && (
        <div className="text-sm text-muted-foreground italic">Wählen Sie mindestens eine Kategorie</div>
      )}
    </div>
  )
}

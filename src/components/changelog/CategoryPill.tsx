import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CategoryPillProps {
  label: string
  icon: LucideIcon
  isSelected: boolean
  count: number
  color: string
  onClick: () => void
}

export function CategoryPill({ label, icon: Icon, isSelected, count, color, onClick }: CategoryPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 cursor-pointer',
        isSelected
          ? `${color} border border-current shadow-md hover:shadow-lg`
          : 'border-2 border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:border-muted-foreground/50'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{label}</span>
      <span className={cn('ml-1 rounded-full px-2.5 py-0.5 text-xs font-bold', isSelected ? 'bg-black/15 dark:bg-white/15' : 'bg-muted/50')}>
        {count}
      </span>
    </button>
  )
}

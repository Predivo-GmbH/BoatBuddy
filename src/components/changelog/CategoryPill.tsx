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
        'inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all duration-150',
        isSelected
          ? `${color} border border-current shadow-sm hover:shadow-md`
          : 'border border-border bg-muted text-muted-foreground opacity-60 hover:opacity-100 hover:border-muted-foreground'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{label}</span>
      <span className={cn('ml-1 rounded-full px-2 py-0.5 text-xs font-semibold', isSelected ? 'bg-black/10 dark:bg-white/10' : 'bg-muted')}>
        {count}
      </span>
    </button>
  )
}

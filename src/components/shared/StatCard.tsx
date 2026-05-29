import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  subtitle?: string
  icon: LucideIcon
  accentColor?: string
  className?: string
}

export function StatCard({ label, value, subtitle, icon: Icon, accentColor, className }: StatCardProps) {
  return (
    <div className={cn(
      'card-premium rounded-xl border border-border bg-card p-4',
      accentColor ?? 'card-accent-top',
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase leading-tight">{label}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <Icon className="h-4 w-4 text-accent" />
        </div>
      </div>
      <p className="mt-2 text-xl sm:text-2xl font-bold tabular-nums text-foreground break-words">{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] sm:text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  )
}

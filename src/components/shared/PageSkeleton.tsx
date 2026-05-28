interface PageSkeletonProps {
  /** Number of stat cards to show */
  cards?: number
  /** Show a table skeleton below cards */
  table?: boolean
  /** Show chart placeholders */
  charts?: boolean
}

export function PageSkeleton({ cards = 4, table = false, charts = false }: PageSkeletonProps) {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-48 skeleton-shimmer rounded-lg" />
        <div className="mt-2 h-4 w-32 skeleton-shimmer rounded" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 skeleton-shimmer rounded" />
              <div className="h-8 w-8 skeleton-shimmer rounded-lg" />
            </div>
            <div className="h-7 w-24 skeleton-shimmer rounded" />
            <div className="h-3 w-16 skeleton-shimmer rounded" />
          </div>
        ))}
      </div>

      {/* Charts */}
      {charts && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="h-4 w-32 skeleton-shimmer rounded mb-4" />
            <div className="h-48 skeleton-shimmer rounded-lg" />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="h-4 w-32 skeleton-shimmer rounded mb-4" />
            <div className="h-48 skeleton-shimmer rounded-lg" />
          </div>
        </div>
      )}

      {/* Table */}
      {table && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="h-4 w-40 skeleton-shimmer rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <div className="h-4 flex-1 skeleton-shimmer rounded" />
              <div className="h-4 w-20 skeleton-shimmer rounded" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Calendar-specific skeleton with 7-column grid */
export function CalendarSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-4 skeleton-shimmer rounded mx-auto w-8" />
        ))}
      </div>
      {/* Day cells — 5 rows x 7 cols */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg skeleton-shimmer" />
        ))}
      </div>
    </div>
  )
}

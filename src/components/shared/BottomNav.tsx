import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Wallet, Calendar, Ship, MoreHorizontal, Users, Anchor, Newspaper, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Primary tabs shown in the bottom bar (max 4 + "Mehr")
const PRIMARY_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/finanzen', label: 'Finanzen', icon: Wallet },
  { to: '/kalender', label: 'Kalender', icon: Calendar },
  { to: '/nutzung', label: 'Nutzung', icon: Ship },
]

// Secondary items, reachable via the "Mehr" sheet
const MORE_ITEMS = [
  { to: '/gastsessions', label: 'Gäste', icon: Users },
  { to: '/boot', label: 'Boot', icon: Anchor },
  { to: '/neuigkeiten', label: 'News', icon: Newspaper },
]

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()

  // "Mehr" is active when on one of the secondary routes
  const moreActive = MORE_ITEMS.some(item => pathname.startsWith(item.to))

  const closeMore = useCallback(() => setMoreOpen(false), [])

  // Close the sheet whenever the route changes (e.g. after tapping an item)
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  // Close on Escape
  useEffect(() => {
    if (!moreOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMore() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [moreOpen, closeMore])

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm safe-area-bottom lg:hidden">
        <div className="flex items-center justify-around">
          {PRIMARY_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] text-[10px] font-medium transition-colors active:scale-95',
                  isActive ? 'text-accent' : 'text-muted-foreground'
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="truncate max-w-[56px] text-center">{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(prev => !prev)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="Mehr"
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] text-[10px] font-medium transition-colors active:scale-95',
              moreActive || moreOpen ? 'text-accent' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="truncate max-w-[56px] text-center">Mehr</span>
          </button>
        </div>
      </nav>

      {moreOpen && createPortal(
        <div
          onClick={closeMore}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Weitere Navigation"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="fixed bottom-0 left-0 right-0 rounded-t-2xl border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl slide-up"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Mehr</span>
              <button
                type="button"
                onClick={closeMore}
                aria-label="Schliessen"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col">
              {MORE_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 min-h-[52px] text-sm font-medium transition-colors',
                      isActive ? 'bg-muted text-accent' : 'text-foreground hover:bg-muted/50'
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

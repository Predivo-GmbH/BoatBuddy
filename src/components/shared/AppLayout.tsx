import { useRef, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { BoatIcon } from './BoatIcon'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { Footer } from './Footer'
import { useDarkMode } from '@/hooks/useDarkMode'

export function AppLayout() {
  const { isDark, toggle } = useDarkMode()
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground">
        Zum Inhalt springen
      </a>

      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
          <div className="flex items-center">
            <BoatIcon className="h-4 w-4 text-accent" />
            <span className="ml-2 text-base font-semibold text-foreground">BoatBuddy</span>
          </div>
          <button
            onClick={toggle}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isDark ? 'Helles Design' : 'Dunkles Design'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        {/* Main content — extra bottom padding on mobile for bottom nav */}
        <main id="main-content" ref={mainRef} className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 lg:pb-6 scrollbar-thin">
          <Outlet />
        </main>

        {/* Desktop footer */}
        <div className="hidden lg:block">
          <Footer />
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}

import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Anchor } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { Footer } from './Footer'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header — minimal, just logo */}
        <header className="flex h-12 items-center border-b border-border bg-card px-4 lg:hidden">
          <Anchor className="h-4 w-4 text-accent" />
          <span className="ml-2 text-base font-semibold text-foreground">BoatBuddy</span>
        </header>

        {/* Main content — extra bottom padding on mobile for bottom nav */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 lg:pb-6 scrollbar-thin">
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

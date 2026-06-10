import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, Calendar, Users, Ship, Anchor, Newspaper, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BoatIcon } from './BoatIcon'
import { useDarkMode } from '@/hooks/useDarkMode'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/finanzen', label: 'Finanzen', icon: Wallet },
  { to: '/kalender', label: 'Kalender', icon: Calendar },
  { to: '/gastsessions', label: 'Gast-Sessions', icon: Users },
  { to: '/nutzung', label: 'Nutzungslog', icon: Ship },
  { to: '/boot', label: 'Boot & Regeln', icon: Anchor },
  { to: '/neuigkeiten', label: 'Neuigkeiten', icon: Newspaper },
]

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <div className="flex items-center gap-2">
          <BoatIcon className="h-5 w-5 text-accent" />
          <span className="text-lg font-semibold text-foreground">BoatBuddy</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Dark mode toggle */}
      <div className="border-t border-border p-3">
        <DarkModeToggle />
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">Mastercraft X2</p>
        <p className="text-[10px] text-muted-foreground/50">Wake-Surf · Seit 2021</p>
      </div>
    </aside>
  )
}

function DarkModeToggle() {
  const { isDark, toggle } = useDarkMode()
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
      aria-label={isDark ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

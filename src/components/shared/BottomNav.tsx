import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, Calendar, Users, Ship } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/finanzen', label: 'Finanzen', icon: Wallet },
  { to: '/kalender', label: 'Kalender', icon: Calendar },
  { to: '/gastsessions', label: 'Gäste', icon: Users },
  { to: '/nutzung', label: 'Boot', icon: Ship },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm safe-area-bottom lg:hidden">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                isActive
                  ? 'text-accent'
                  : 'text-muted-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

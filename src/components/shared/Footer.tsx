import { Shield } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <span className="text-sm font-semibold text-foreground">BoatBuddy</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3 shrink-0" aria-hidden="true" />
            Swiss-made
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} BoatBuddy by Predivo GmbH. Alle Rechte vorbehalten.
        </p>
      </div>
    </footer>
  )
}

import { Shield } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
      <span>BoatBuddy by Predivo GmbH. Alle Rechte vorbehalten.</span>
      <span className="hidden sm:flex items-center gap-1">
        <Shield className="h-3 w-3" />
        Swiss-made
      </span>
    </footer>
  )
}

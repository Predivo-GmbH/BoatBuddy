import { useState, type ReactNode } from 'react'
import { Anchor } from 'lucide-react'

const GATE_PASSWORD_HASH = import.meta.env.VITE_GATE_PASSWORD_HASH as string
const STORAGE_KEY = 'boatbuddy-unlocked'

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === 'true'
  )
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return <>{children}</>

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const inputHash = await sha256(password)
    if (inputHash === GATE_PASSWORD_HASH) {
      sessionStorage.setItem(STORAGE_KEY, 'true')
      setUnlocked(true)
    } else {
      setError(true)
      setPassword('')
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="mx-4 w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Anchor className="h-6 w-6 text-accent" />
            <h1 className="text-xl font-semibold text-foreground">BoatBuddy</h1>
          </div>
          <p className="text-sm text-muted-foreground">Passwort eingeben um fortzufahren</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false) }}
          placeholder="Passwort"
          aria-label="Passwort"
          className="min-h-[44px] w-full rounded-md border border-input bg-card px-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        {error && <p role="alert" className="text-sm text-destructive">Falsches Passwort</p>}
        <button
          type="submit"
          className="min-h-[44px] w-full rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Weiter
        </button>
      </form>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BoatIcon } from './BoatIcon'

function isMember(session: Session | null) {
  return !!session && session.user.app_metadata.boatbuddy_member === true &&
    (session.expires_at ?? 0) > Date.now() / 1000
}

// What the member sees. Only a refused password says "wrong": a full rate limit or a
// sign-in that is unavailable must not make members doubt the password they know.
const MESSAGES = {
  wrong: 'Falsches Passwort',
  busy: 'Zu viele Anmeldeversuche. Bitte warte einige Minuten und versuche es dann erneut.',
  unavailable: 'Anmeldung gerade nicht möglich. Bitte versuche es später erneut.',
} as const
type GateError = keyof typeof MESSAGES

// supabase-js puts the function's HTTP response on FunctionsHttpError.context.
function gateErrorOf(error: unknown): GateError {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status
  if (status === 401 || status === 400) return 'wrong'
  if (status === 429) return 'busy'
  return 'unavailable'
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<GateError | null>(null)

  useEffect(() => {
    let active = true
    // The old browser flag has no authority. Do not migrate it into a session.
    sessionStorage.removeItem('boatbuddy-unlocked')
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(isMember(next) ? next : null)
      if (!isMember(next)) queryClient.clear()
    })
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession() // refreshes if needed
        if (isMember(data.session)) {
          const { data: verified, error: authError } = await supabase.auth.getUser()
          if (active) setSession(!authError && verified.user?.app_metadata.boatbuddy_member === true ? data.session : null)
        }
      } catch { if (active) setSession(null) }
      finally { if (active) setChecking(false) }
    })()
    return () => { active = false; subscription.unsubscribe() }
  }, [queryClient])

  useEffect(() => {
    if (!session?.expires_at) return
    // Auto-refresh normally replaces this timer. A failed/offline refresh must
    // still re-lock the screen when the old access token expires.
    const timer = setTimeout(() => { setSession(null); queryClient.clear() },
      Math.max(0, session.expires_at * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [session, queryClient])

  if (checking) return <div className="flex h-screen items-center justify-center text-muted-foreground">Laden...</div>
  if (isMember(session)) return <>{children}</>

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const { data, error: gateError } = await supabase.functions.invoke('member-session', { body: { password } })
      if (gateError) {
        const kind = gateErrorOf(gateError)
        setError(kind)
        if (kind === 'wrong') setPassword('')
        return
      }
      if (!data?.access_token || !data?.refresh_token) throw new Error('login')
      const { data: signedIn, error: sessionError } = await supabase.auth.setSession(data)
      if (sessionError || !isMember(signedIn.session)) throw new Error('session')
      queryClient.clear()
      setSession(signedIn.session)
      setPassword('')
    } catch {
      setError('unavailable')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="mx-4 w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <BoatIcon className="h-6 w-6 text-accent" />
            <h1 className="text-xl font-semibold text-foreground">BoatBuddy</h1>
          </div>
          <p className="text-sm text-muted-foreground">Passwort eingeben um fortzufahren</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          placeholder="Passwort"
          aria-label="Passwort"
          className="min-h-[44px] w-full rounded-md border border-input bg-card px-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        {error && <p role="alert" className="text-sm text-destructive">{MESSAGES[error]}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] w-full rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Weiter
        </button>
      </form>
    </div>
  )
}

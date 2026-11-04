import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { PasswordGate } from '../PasswordGate'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), setSession: vi.fn(), unsubscribe: vi.fn(),
  listener: undefined as undefined | ((event: string, session: unknown) => void),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  auth: { getSession: mocks.getSession, getUser: mocks.getUser, setSession: mocks.setSession,
    onAuthStateChange: (cb: typeof mocks.listener) => { mocks.listener = cb; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } } },
  },
} }))
const member = () => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Date.now() / 1000 + 900,
  user: { id: 'fixture-member', app_metadata: { boatbuddy_member: true } } })
let client: QueryClient
// supabase-js FunctionsHttpError carries the function's response as `context`.
const httpError = (status: number) => Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: new Response(null, { status }) })
async function mount() {
  client = new QueryClient()
  render(<QueryClientProvider client={client}><PasswordGate><main>Protected</main></PasswordGate></QueryClientProvider>)
  await waitFor(() => expect(screen.queryByText('Laden...')).not.toBeInTheDocument())
}
async function submit(password = 'fixture password') {
  const user = userEvent.setup()
  if (password) await user.type(screen.getByLabelText('Passwort'), password)
  await user.click(screen.getByRole('button', { name: 'Weiter' }))
}
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear()
  mocks.getSession.mockResolvedValue({ data: { session: null } })
  mocks.getUser.mockResolvedValue({ data: { user: member().user }, error: null })
  mocks.invoke.mockResolvedValue({ data: { access_token: 'fixture-access', refresh_token: 'fixture-refresh' }, error: null })
  mocks.setSession.mockResolvedValue({ data: { session: member() }, error: null })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('PasswordGate with native member sessions', () => {
  it('keeps the heading and password prompt', async () => {
    await mount(); expect(screen.getByRole('heading', { name: 'BoatBuddy' })).toBeVisible()
    expect(screen.getByText('Passwort eingeben um fortzufahren')).toBeVisible()
  })
  it('keeps the masked accessible input and Weiter button', async () => {
    await mount(); expect(screen.getByLabelText('Passwort')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeEnabled()
  })
  it('hides children while locked', async () => { await mount(); expect(screen.queryByText('Protected')).not.toBeInTheDocument() })
  it('starts without an error', async () => { await mount(); expect(screen.queryByRole('alert')).not.toBeInTheDocument() })
  it('ignores and removes the old forged browser flag', async () => {
    sessionStorage.setItem('boatbuddy-unlocked', 'true'); await mount()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument(); expect(sessionStorage.getItem('boatbuddy-unlocked')).toBeNull()
  })
  it('restores a verified member after reload', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: member() } }); await mount()
    expect(screen.getByText('Protected')).toBeVisible(); expect(mocks.getUser).toHaveBeenCalledOnce()
  })
  it('rejects a tampered stored session when Auth rejects it', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: member() } })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') }); await mount()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })
  it('rejects an expired stored pass', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { ...member(), expires_at: Date.now() / 1000 - 1 } } }); await mount()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })
  it('rejects an authenticated nonmember', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { ...member(), user: { app_metadata: {} } } } }); await mount()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })
  it('sends the typed password to the server and installs the returned session', async () => {
    await mount(); await submit()
    expect(mocks.invoke).toHaveBeenCalledWith('member-session', { body: { password: 'fixture password' } })
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' })
    expect(screen.getByText('Protected')).toBeVisible()
  })
  it('never writes a browser unlock flag', async () => {
    await mount(); await submit(); expect(sessionStorage.getItem('boatbuddy-unlocked')).toBeNull()
  })
  it('preserves the wrong-password message and clears the input', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(401) }); await mount(); await submit('wrong')
    expect(screen.getByRole('alert')).toHaveTextContent('Falsches Passwort'); expect(screen.getByLabelText('Passwort')).toHaveValue('')
    expect(mocks.setSession).not.toHaveBeenCalled()
  })
  it('clears the error on typing and allows a retry', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: httpError(401) }); await mount(); await submit('wrong')
    await userEvent.setup().type(screen.getByLabelText('Passwort'), 'fixture password')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Weiter' })); expect(screen.getByText('Protected')).toBeVisible()
  })
  it('says "too many attempts", not "wrong password", when the rate limit answers 429', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(429) }); await mount(); await submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Zu viele Anmeldeversuche')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Falsches Passwort')
    expect(screen.getByLabelText('Passwort')).toHaveValue('fixture password')
    expect(mocks.setSession).not.toHaveBeenCalled()
  })
  it.each([
    ['a 503 from the function', () => ({ data: null, error: httpError(503) })],
    ['an unreachable function', () => ({ data: null, error: new Error('Failed to send a request to the Edge Function') })],
  ])('says the sign-in is unavailable, not "wrong password", on %s', async (_label, answer) => {
    mocks.invoke.mockResolvedValue(answer()); await mount(); await submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Anmeldung gerade nicht möglich')
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })
  it('submits with Enter', async () => {
    await mount(); await userEvent.setup().type(screen.getByLabelText('Passwort'), 'fixture password{Enter}')
    await waitFor(() => expect(screen.getByText('Protected')).toBeVisible())
  })
  it('does not unlock on a malformed server response', async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null }); await mount(); await submit()
    expect(screen.getByRole('alert')).toBeVisible(); expect(mocks.setSession).not.toHaveBeenCalled()
  })
  it('does not unlock if installing the session fails', async () => {
    mocks.setSession.mockResolvedValue({ data: { session: null }, error: new Error('Auth unavailable') }); await mount(); await submit()
    expect(screen.getByRole('alert')).toBeVisible(); expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })
  it('fails closed on an unavailable Auth service', async () => {
    mocks.getSession.mockRejectedValue(new Error('offline')); await mount(); expect(screen.getByLabelText('Passwort')).toBeVisible()
  })
  it('blocks duplicate submissions while a request is pending', async () => {
    let finish!: (value: unknown) => void
    mocks.invoke.mockReturnValue(new Promise(resolve => { finish = resolve })); await mount(); await submit()
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Weiter' })); expect(mocks.invoke).toHaveBeenCalledOnce()
    await act(async () => finish({ data: null, error: new Error('offline') }))
  })
  it('clears cached boat data on sign-out', async () => {
    await mount(); await submit(); client.setQueryData(['boat'], 'private fixture')
    act(() => mocks.listener?.('SIGNED_OUT', null))
    expect(screen.queryByText('Protected')).not.toBeInTheDocument(); expect(client.getQueryData(['boat'])).toBeUndefined()
  })
  it('locks and clears cached data when refresh fails and the pass expires', async () => {
    await mount(); vi.useFakeTimers()
    act(() => mocks.listener?.('SIGNED_IN', { ...member(), expires_at: Date.now() / 1000 + 1 }))
    client.setQueryData(['boat'], 'private fixture')
    act(() => vi.advanceTimersByTime(1001))
    expect(screen.queryByText('Protected')).not.toBeInTheDocument(); expect(client.getQueryData(['boat'])).toBeUndefined()
  })
  it('keeps a refreshed member session open', async () => {
    await mount(); await submit(); act(() => mocks.listener?.('TOKEN_REFRESHED', member()))
    expect(screen.getByText('Protected')).toBeVisible()
  })
  it('unsubscribes when unmounted', async () => { await mount(); cleanup(); expect(mocks.unsubscribe).toHaveBeenCalledOnce() })
})

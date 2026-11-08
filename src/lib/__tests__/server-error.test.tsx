// CONTRACT-customer-error-message-2026-11-08.md section 3 a, b, c for the app's ONE shared notice:
// a. server error + report OK -> the notified text with the reference is shown;
// b. server error + report fails -> the pre-filled support message, and "benachrichtigt" is NOT shown;
// c. "non-2xx" (or any raw error text) cannot reach the screen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { Toaster } from 'sonner'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }))

import { showServerError, resetServerErrorNoticesForTests } from '@/lib/show-server-error'
import { describeError, noticeFor, screenName, supportMail, UserFacingError, REPORT_TIMEOUT_MS } from '@/lib/server-error'
import { createQueryClient } from '@/lib/query-client'
import { reservationError, OVERLAP_MESSAGE } from '@/hooks/useReservierungen'

const NON_2XX = 'Edge Function returned a non-2xx status code'
// supabase-js FunctionsHttpError: its message is the sentence the ChannelMover customer saw.
const functionError = (status: number, body = '{"error":"Price not configured"}') =>
  Object.assign(new Error(NON_2XX), { name: 'FunctionsHttpError', context: new Response(body, { status }) })
const reportOk = (reference = 'E-ABC234') => mocks.invoke.mockResolvedValue({ data: { reference }, error: null })
const reportFails = () => mocks.invoke.mockResolvedValue({ data: null, error: functionError(503, '{"error":"Report not stored"}') })

function mountToaster() {
  render(<Toaster />)
}

beforeEach(() => {
  mocks.invoke.mockReset()
  resetServerErrorNoticesForTests()
  window.history.pushState({}, '', '/finanzen')
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('a. report confirmed -> the person is told our team was notified, with the reference', () => {
  it('shows the notified text, the reference and the meanwhile line', async () => {
    reportOk('E-ABC234')
    mountToaster()
    await act(() => showServerError(functionError(500), { action: 'createAusgabe', meanwhile: 'Deine Eingabe ist noch da.' }))
    expect(await screen.findByText('Bei uns ist etwas schiefgelaufen. Unser Team wurde automatisch benachrichtigt und kümmert sich darum. Referenz: E-ABC234')).toBeVisible()
    expect(screen.getByText('In der Zwischenzeit: Deine Eingabe ist noch da.')).toBeVisible()
  })

  it('sends one report with area, screen, action, status, the raw text and a 4 s limit', async () => {
    reportOk()
    mountToaster()
    await act(() => showServerError(functionError(400), { action: 'createAusgabe' }))
    expect(mocks.invoke).toHaveBeenCalledOnce()
    const [name, options] = mocks.invoke.mock.calls[0]
    expect(name).toBe('report-client-error')
    expect(options.timeout).toBe(REPORT_TIMEOUT_MS)
    expect(REPORT_TIMEOUT_MS).toBe(4000)
    expect(options.body).toMatchObject({ area: 'other', screen: 'finanzen', action: 'createAusgabe', status: 400 })
    // The function's own answer travels with the report (it says what was really wrong).
    expect(options.body.message).toContain(NON_2XX)
    expect(options.body.message).toContain('Price not configured')
  })

  it('names the screen after the route', () => {
    expect(screenName('/finanzen')).toBe('finanzen')
    expect(screenName('/')).toBe('start')
    expect(screenName('/phone-upload')).toBe('phone-upload')
  })

  it('a failed save anywhere in the app gets the notice through the shared QueryClient', async () => {
    reportOk('E-SAVE23')
    function Screen() {
      const save = useMutation({ meta: { action: 'createBeitrag' }, mutationFn: async () => { throw new Error('permission denied for table beitraege') } })
      return <button onClick={() => save.mutate()}>Speichern</button>
    }
    render(<QueryClientProvider client={createQueryClient()}><Screen /><Toaster /></QueryClientProvider>)
    act(() => screen.getByRole('button', { name: 'Speichern' }).click())
    expect(await screen.findByText(/Unser Team wurde automatisch benachrichtigt.*Referenz: E-SAVE23/)).toBeVisible()
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ action: 'createBeitrag', screen: 'finanzen' })
    expect(document.body.textContent).not.toContain('permission denied')
  })

  it('a first load that fails gets the notice; several failing queries of one screen are one report', async () => {
    reportOk('E-LOAD23')
    function Screen() {
      useQuery({ queryKey: ['a'], retry: false, queryFn: async () => { throw new Error('relation a does not exist') } })
      useQuery({ queryKey: ['b'], retry: false, queryFn: async () => { throw new Error('relation b does not exist') } })
      return null
    }
    render(<QueryClientProvider client={createQueryClient()}><Screen /><Toaster /></QueryClientProvider>)
    expect(await screen.findByText(/Referenz: E-LOAD23/)).toBeVisible()
    expect(mocks.invoke).toHaveBeenCalledOnce()
    expect(mocks.invoke.mock.calls[0][1].body.action).toBe('daten-laden')
  })
})

describe('b. report NOT confirmed -> the pre-filled support message, never "notified"', () => {
  it.each([
    ['the function answers 503', () => reportFails()],
    ['the function is unreachable', () => mocks.invoke.mockRejectedValue(new TypeError('Failed to fetch'))],
    ['the answer carries no reference', () => mocks.invoke.mockResolvedValue({ data: {}, error: null })],
    ['the answer carries a malformed reference', () => mocks.invoke.mockResolvedValue({ data: { reference: '<b>x</b>' }, error: null })],
  ])('%s', async (_label, arrange) => {
    arrange()
    mountToaster()
    await act(() => showServerError(functionError(500), { action: 'createAusgabe' }))
    expect(await screen.findByText(/wir konnten es nicht automatisch melden\. Bitte schick uns diese Nachricht – sie ist schon ausgefüllt\./)).toBeVisible()
    expect(document.body.textContent).not.toMatch(/benachrichtigt|Referenz/)
    const link = screen.getByRole('link', { name: 'Nachricht senden' })
    expect(link.getAttribute('href')).toMatch(/^mailto:hello@predivo\.ch\?subject=/)
  })

  it('gives up after 4 seconds without an answer and offers the mail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.invoke.mockReturnValue(new Promise(() => {}))
    mountToaster()
    let done = false
    void showServerError(functionError(500), { action: 'createAusgabe' }).then(() => { done = true })
    await act(async () => { await vi.advanceTimersByTimeAsync(REPORT_TIMEOUT_MS - 100) })
    expect(done).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await waitFor(() => expect(done).toBe(true))
    expect(screen.getByRole('link', { name: 'Nachricht senden' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('benachrichtigt')
  })

  it('fills the mail with screen, action, time and the error text', async () => {
    const details = await describeError(functionError(500))
    const at = new Date('2026-11-08T21:15:02.000Z')
    const body = decodeURIComponent(supportMail(details, { action: 'createAusgabe', screen: 'finanzen' }, at).split('&body=')[1])
    expect(body).toContain('Bildschirm: finanzen')
    expect(body).toContain('Aktion: createAusgabe')
    expect(body).toContain('Zeit: ')
    expect(body).toContain('2026-11-08T21:15:02.000Z')
    expect(body).toContain(`Fehler: FunctionsHttpError: ${NON_2XX}`)
    expect(body).toContain('(HTTP 500)')
  })

  it('noticeFor says notified only with a stored reference', async () => {
    reportOk('E-XYZ789')
    expect(await noticeFor(new Error('x'), { action: 'a' })).toEqual({ kind: 'notified', reference: 'E-XYZ789' })
    reportFails()
    expect((await noticeFor(new Error('x'), { action: 'a' })).kind).toBe('fallback')
  })
})

describe('c. the raw error never reaches the screen', () => {
  it.each([['report OK', () => reportOk()], ['report failed', () => reportFails()]])('%s: no "non-2xx", no stack, no JSON', async (_l, arrange) => {
    arrange()
    mountToaster()
    const error = functionError(500, '{"error":"secret detail","stack":"at handler (index.ts:12)"}')
    await act(() => showServerError(error, { action: 'createAusgabe' }))
    await screen.findByText(/Bei uns ist etwas schiefgelaufen/)
    const text = document.body.textContent ?? ''
    for (const raw of [NON_2XX, 'non-2xx', 'FunctionsHttpError', 'secret detail', 'index.ts', '{"error"']) expect(text).not.toContain(raw)
  })

  it('an expected conflict is said in plain words and is not reported as our fault', async () => {
    mountToaster()
    const conflict = reservationError('conflicting key value violates exclusion constraint "reservierungen_no_overlap"')
    expect(conflict).toBeInstanceOf(UserFacingError)
    await act(() => showServerError(conflict, { action: 'createReservierung' }))
    expect(await screen.findByText(OVERLAP_MESSAGE)).toBeVisible()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('reservierungen_no_overlap')
    expect(reservationError('permission denied')).not.toBeInstanceOf(UserFacingError)
  })

  it('no screen hands an error object\'s own text to a toast (only lib/show-server-error.ts may, for UserFacingError)', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) { if (name !== '__tests__') walk(path); continue }
        if (/\.tsx?$/.test(name)) files.push(path)
      }
    }
    walk('src')
    const offenders = files
      .filter(f => !f.replaceAll('\\', '/').endsWith('src/lib/show-server-error.ts'))
      .flatMap(f => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f, i: i + 1, line })))
      .filter(({ line }) => /toast\.(error|warning|message|info)\([^)]*(\berr\b|\berror\b|\.message\b)/.test(line))
      .map(({ f, i, line }) => `${f}:${i}: ${line.trim()}`)
    expect(offenders).toEqual([])
  })
})

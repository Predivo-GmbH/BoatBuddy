/**
 * What a person is told when the server fails them, and the report that makes it true.
 *
 * Roger, 08.11.2026: "we also need to have UX for the user himself so that he knows we have
 * recognized the issue and the tech team is taking care of it ... moment it happens." Contract:
 * C:/Business/Audits/CONTRACT-customer-error-message-2026-11-08.md (section 2). Trigger:
 * ChannelMover's purchase function refused every purchase for 5.5 months and the customer only
 * ever saw "Edge Function returned a non-2xx status code".
 *
 * The rules this file keeps:
 * - "Unser Team wurde automatisch benachrichtigt" appears ONLY after report-client-error answered
 *   200 with a reference, and that function answers 200 only once the report is stored.
 * - Report not confirmed (error, 503, no answer within 4 s): the person gets a support mail that is
 *   already filled in, and is never told that anybody was notified.
 * - The raw error text (a supabase-js sentence, a stack, a JSON body) never reaches the screen. It
 *   goes into the report and into the pre-filled mail, nowhere else.
 * - No e-mail is promised yet: the "we'll e-mail you when it's fixed" sentence comes with step 3,
 *   once that e-mail exists.
 *
 * The toast that shows it on every screen is show-server-error.ts; the sign-in screen and the
 * crash screen show the same notice inline (components/shared/ServerErrorNotice.tsx).
 */
import { supabase } from '@/lib/supabase'

export type ErrorArea = 'money' | 'signin' | 'other'

export interface ErrorContext {
  /** What the person was doing, e.g. a mutation name such as createAusgabe. */
  action: string
  /** money (none in BoatBuddy: it sells nothing), signin, or other. Default other. */
  area?: ErrorArea
  /** The screen; defaults to the current route, e.g. finanzen. */
  screen?: string
  /** The "In der Zwischenzeit" line that fits this screen. Must be true for it. */
  meanwhile?: string
}

/**
 * An error the person caused or can solve, with a message written for them (an overlapping
 * reservation, a sign-in that expired). Shown as it is, never reported as our fault.
 */
export class UserFacingError extends Error {
  name = 'UserFacingError'
}

export const REPORT_TIMEOUT_MS = 4000
// BoatBuddy has no support form of its own; Predivo GmbH's public address is its support mail.
export const SUPPORT_ADDRESS = 'hello@predivo.ch'
export const DEFAULT_MEANWHILE = 'Bitte versuche es in ein paar Minuten noch einmal.'

export const NOTICE = {
  pending: 'Bei uns ist etwas schiefgelaufen. Wir melden es gerade automatisch …',
  notified: (reference: string) =>
    `Bei uns ist etwas schiefgelaufen. Unser Team wurde automatisch benachrichtigt und kümmert sich darum. Referenz: ${reference}`,
  meanwhile: (text: string) => `In der Zwischenzeit: ${text}`,
  fallback: 'Bei uns ist etwas schiefgelaufen, und wir konnten es nicht automatisch melden. ' +
    'Bitte schick uns diese Nachricht – sie ist schon ausgefüllt.',
  send: 'Nachricht senden',
} as const

export type Notice =
  | { kind: 'pending' }
  | { kind: 'notified'; reference: string }
  | { kind: 'fallback'; mailto: string }

const NAME = /^[A-Za-z0-9_./:-]{1,60}$/
const VERSION = /^[A-Za-z0-9_.+-]{1,40}$/
export const REFERENCE = /^E-[A-Z2-9]{6}$/

const rawVersion: unknown = import.meta.env.VITE_APP_VERSION
export const APP_VERSION: string | null = typeof rawVersion === 'string' && VERSION.test(rawVersion) ? rawVersion : null

/** The route as a screen name the report accepts: /finanzen -> finanzen, / -> start. */
export function screenName(pathname: string = typeof window === 'undefined' ? '' : window.location.pathname): string {
  const name = pathname.replace(/^\/+|\/+$/g, '').replace(/[^A-Za-z0-9_./:-]+/g, '-').slice(0, 60)
  return name || 'start'
}

const safeName = (value: string | undefined, fallback: string) => value && NAME.test(value) ? value : fallback

export interface ErrorDetails {
  status: number | null
  /** For the report and the support mail only, never for the screen. At most 500 characters. */
  message: string
}

/** Status and text of any error: a supabase-js function or database error, a thrown Error, anything. */
export async function describeError(error: unknown): Promise<ErrorDetails> {
  const e = (error ?? {}) as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; context?: unknown }
  const context = e.context as { status?: unknown; bodyUsed?: boolean; clone?: () => Response } | undefined
  const rawStatus = context?.status ?? e.status
  const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 0 && rawStatus <= 599 ? rawStatus : null
  let text = error instanceof Error ? `${error.name}: ${error.message}`
    : typeof e.message === 'string' ? e.message : String(error)
  if (typeof e.code === 'string' && e.code) text += ` [${e.code}]`
  // A function's own answer says more than supabase-js's "non-2xx" sentence (ChannelMover's said
  // which price was missing). Read it once, bounded; the function removes anything personal.
  if (context && typeof context.clone === 'function' && context.bodyUsed === false) {
    try { text += ` | ${(await withTimeout(context.clone().text(), 1000)).slice(0, 200)}` } catch { /* body unreadable: the status still says enough */ }
  }
  return { status, message: text.slice(0, 500) }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('report timeout')), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Send the report. The reference when it was STORED (200 + reference), else null. Never throws. */
export async function reportClientError(details: ErrorDetails, ctx: ErrorContext): Promise<string | null> {
  try {
    const { data, error } = await withTimeout(supabase.functions.invoke('report-client-error', {
      body: {
        area: ctx.area ?? 'other',
        screen: safeName(ctx.screen ?? screenName(), 'unbekannt'),
        action: safeName(ctx.action, 'unbekannt'),
        status: details.status,
        message: details.message,
        app_version: APP_VERSION,
      },
      timeout: REPORT_TIMEOUT_MS,
    }), REPORT_TIMEOUT_MS)
    const reference = (data as { reference?: unknown } | null)?.reference
    return !error && typeof reference === 'string' && REFERENCE.test(reference) ? reference : null
  } catch {
    return null
  }
}

/** The support mail, filled in with screen, action, time and the error text. */
export function supportMail(details: ErrorDetails, ctx: ErrorContext, at: Date = new Date()): string {
  const screen = safeName(ctx.screen ?? screenName(), 'unbekannt')
  const subject = `BoatBuddy: Fehler auf ${screen}`
  const body = [
    'Hallo',
    '',
    'BoatBuddy hat mir einen Fehler gezeigt und konnte ihn nicht automatisch melden.',
    '',
    `Bildschirm: ${screen}`,
    `Aktion: ${safeName(ctx.action, 'unbekannt')}`,
    `Zeit: ${at.toLocaleString('de-CH')} (${at.toISOString()})`,
    `Fehler: ${details.message}${details.status !== null ? ` (HTTP ${details.status})` : ''}`,
    `Version: ${APP_VERSION ?? 'unbekannt'}`,
  ].join('\n')
  return `mailto:${SUPPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Report the error and decide what the person is told: notified with a reference, or the mail. */
export async function noticeFor(error: unknown, ctx: ErrorContext): Promise<Exclude<Notice, { kind: 'pending' }>> {
  const details = await describeError(error)
  const reference = await reportClientError(details, ctx)
  return reference !== null ? { kind: 'notified', reference } : { kind: 'fallback', mailto: supportMail(details, ctx) }
}

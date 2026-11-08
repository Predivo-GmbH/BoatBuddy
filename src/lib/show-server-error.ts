/**
 * THE one place a server error reaches the screen as a toast. Every mutation and every first load
 * of a query lands here through the QueryClient in App.tsx; uploads, the phone page and the QR
 * session call it directly. Rules and texts: lib/server-error.ts.
 */
import { createElement } from 'react'
import { toast } from 'sonner'
import { ServerErrorNotice } from '@/components/shared/ServerErrorNotice'
import { noticeFor, screenName, UserFacingError, type ErrorContext } from '@/lib/server-error'

// Several queries of one screen failing together are one problem: one notice, one report.
export const REPEAT_WINDOW_MS = 30_000
const shownAt = new Map<string, number>()

export function resetServerErrorNoticesForTests() {
  shownAt.clear()
}

/** Report the error and show the notice. Resolves once the final notice is on screen. */
export async function showServerError(error: unknown, ctx: ErrorContext): Promise<void> {
  if (error instanceof UserFacingError) {
    toast.error(error.message)
    return
  }
  const screen = ctx.screen ?? screenName()
  const key = `${screen}|${ctx.action}`
  const now = Date.now()
  if (now - (shownAt.get(key) ?? Number.NEGATIVE_INFINITY) < REPEAT_WINDOW_MS) return
  shownAt.set(key, now)
  const id = toast.loading(createElement(ServerErrorNotice, { notice: { kind: 'pending' } }), { duration: Number.POSITIVE_INFINITY })
  const notice = await noticeFor(error, { ...ctx, screen })
  toast.error(createElement(ServerErrorNotice, { notice, meanwhile: ctx.meanwhile }), {
    id,
    // Long enough to read out the reference or reach the mail button; the person can close it.
    duration: notice.kind === 'notified' ? 20_000 : 60_000,
    closeButton: true,
  })
}

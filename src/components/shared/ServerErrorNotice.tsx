import { DEFAULT_MEANWHILE, NOTICE, type Notice } from '@/lib/server-error'

/**
 * The one notice for a server error, in the toast (lib/show-server-error.ts) and inline on the
 * sign-in and crash screens. Texts and rules: lib/server-error.ts.
 */
export function ServerErrorNotice({ notice, meanwhile = DEFAULT_MEANWHILE }: { notice: Notice; meanwhile?: string }) {
  if (notice.kind === 'pending') {
    return <span data-server-error="pending" className="block">{NOTICE.pending}</span>
  }
  if (notice.kind === 'notified') {
    return (
      <span data-server-error="notified" className="block">
        <span className="block">{NOTICE.notified(notice.reference)}</span>
        <span className="mt-1 block">{NOTICE.meanwhile(meanwhile)}</span>
      </span>
    )
  }
  return (
    <span data-server-error="fallback" className="block">
      <span className="block">{NOTICE.fallback}</span>
      <a
        href={notice.mailto}
        className="mt-2 inline-flex min-h-[44px] items-center font-medium underline underline-offset-2"
      >
        {NOTICE.send}
      </a>
    </span>
  )
}

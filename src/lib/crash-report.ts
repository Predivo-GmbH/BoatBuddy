/**
 * Stale-chunk recovery + crash logging for the app-level ErrorBoundary.
 *
 * After a production deploy the hashed lazy-chunk filenames change; a tab still
 * running the OLD index.html requests a chunk that no longer exists → the dynamic
 * import rejects and the ErrorBoundary would otherwise dead-end on an error screen.
 * Instead we detect that specific error and reload ONCE PER CHUNK so the new build
 * loads transparently. Genuine crashes still surface.
 *
 * Portable: no project-specific imports — drop this file into any Vite/React app.
 */

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const name = error instanceof Error ? error.name : ''
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('error loading dynamically imported module') ||
    name === 'ChunkLoadError'
  )
}

/**
 * Reload once per failing chunk (keyed by the chunk URL in the error message).
 * Returns true when a reload was initiated — callers should render nothing.
 * A chunk that still fails after its reload returns false and surfaces, so a
 * real broken build can never trap the user in a reload loop.
 */
export function reloadOnceForChunk(
  error: unknown,
  reload: () => void = () => window.location.reload(),
): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const chunkId = message.match(/https?:\/\/\S+\.js/)?.[0] ?? message.slice(0, 120)
  const key = `app_chunk_reload:${chunkId}`
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch {
    return false // storage denied — don't risk a reload loop
  }
  reload()
  return true
}

/** Persist + log a crash. Never throws. */
export function reportCrash(source: string, error: unknown, componentStack = ''): void {
  const report = {
    ts: new Date().toISOString(),
    url: window.location.href,
    source,
    message: String(error instanceof Error ? error.message : error).slice(0, 500),
    stack: String(error instanceof Error ? (error.stack ?? '') : '').slice(0, 4000),
    componentStack: String(componentStack ?? '').slice(0, 4000),
  }
  console.error(`[${source}] crash:`, report.message, error, componentStack)
  try {
    localStorage.setItem('app_last_crash', JSON.stringify(report))
  } catch { /* storage full or denied — console.error above remains */ }
}

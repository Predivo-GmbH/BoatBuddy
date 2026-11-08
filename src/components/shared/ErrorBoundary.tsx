import { Component, type ReactNode, type ErrorInfo } from 'react'
import { isChunkLoadError, reloadOnceForChunk, reportCrash } from '@/lib/crash-report'
import { noticeFor, type Notice } from '@/lib/server-error'
import { ServerErrorNotice } from './ServerErrorNotice'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  notice: Notice | null
}

// A crash is an error the member sees too: the same notice as every server error
// (lib/server-error.ts), reported, with the reference or the pre-filled support mail.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, notice: null }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnceForChunk(error)) {
      return
    }
    reportCrash('error-boundary', error, info?.componentStack ?? '')
    this.setState({ notice: { kind: 'pending' } })
    void noticeFor(error, { action: 'seiteAnzeigen' }).then(notice => this.setState({ notice }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
          {this.state.notice && (
            <div role="alert" className="max-w-md text-sm text-foreground">
              <ServerErrorNotice notice={this.state.notice} meanwhile="Lade die Seite neu, meist geht es dann weiter." />
            </div>
          )}
          <p className="text-sm text-muted-foreground">Bitte lade die Seite neu.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground"
          >
            Seite neu laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

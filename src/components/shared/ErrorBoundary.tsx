import { Component, type ReactNode, type ErrorInfo } from 'react'
import { isChunkLoadError, reloadOnceForChunk, reportCrash } from '@/lib/crash-report'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnceForChunk(error)) {
      return
    }
    reportCrash('error-boundary', error, info?.componentStack ?? '')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
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

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import i18n from '@/i18n'

/** Catches render crashes so the user sees the error instead of a blank
 * white screen. Vite HMR still works underneath. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center page-px gap-3">
          <h1 className="text-[22px] font-semibold text-ink">{i18n.t('error.boundaryTitle')}</h1>
          <pre className="mono-sm text-error-text bg-error-bg rounded-xs p-3 max-w-full overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="text-sm text-accent underline underline-offset-2"
          >
            {i18n.t('action.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

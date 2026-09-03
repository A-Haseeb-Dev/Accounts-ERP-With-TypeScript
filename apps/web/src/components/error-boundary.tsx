'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the heading, e.g. the page name. */
  title?: string;
}

interface State {
  error: Error | null;
}

/**
 * Global (per-subtree) React error boundary. Catches any client-side render
 * exception and shows a clean, actionable fallback instead of the browser /
 * framework blank white error page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Forward to any error-reporting service here in the future.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    const message =
      this.state.error.message && this.state.error.message !== 'undefined'
        ? this.state.error.message
        : 'An unexpected error occurred while loading this page.';

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">
            {this.props.title ? `${this.props.title} ran into a problem` : 'Something went wrong'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{message}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={this.reset}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-600"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
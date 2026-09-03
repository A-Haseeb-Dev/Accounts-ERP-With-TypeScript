'use client';

/**
 * Inline error banner used across data pages. Shown when a query fails so the
 * user sees a clear message (and a retry) instead of a blank area or crash.
 */
export function QueryError({
  message = 'Something went wrong while loading this data.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{message}</span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
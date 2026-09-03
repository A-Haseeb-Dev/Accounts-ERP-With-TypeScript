'use client';

/**
 * Lightweight loading placeholder for report tables. Shown while a report
 * query is fetching so the page feels responsive instead of flashing empty.
 */
export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-0" aria-busy="true">
      <div className="flex">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={`h${i}`} className="h-8 flex-1 animate-pulse border-b border-slate-100 px-4 py-2">
            <div className="h-3 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex border-b border-slate-100 last:border-0">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={`c${r}-${i}`} className="h-9 flex-1 px-4 py-2">
              <div className="h-3 w-3/4 rounded bg-slate-50" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
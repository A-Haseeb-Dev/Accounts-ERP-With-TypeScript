'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, Spinner } from '@/components/ui/spinner';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  rowKey: (row: T) => string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  rowKey,
  page,
  pageSize,
  total,
  onPageChange,
  emptyTitle,
  emptyMessage,
  onRowClick,
}: DataTableProps<T>) {
  const totalPages = total != null && pageSize ? Math.ceil(total / pageSize) : 0;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <Spinner className="py-10" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} message={emptyMessage} />
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3 text-slate-700',
                        c.align === 'right' && 'text-right font-medium tabular-nums',
                        c.align === 'center' && 'text-center',
                        c.className,
                      )}
                    >
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 0 && onPageChange && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-500">
          <span className="tabular-nums">
            Page {page} of {totalPages} · {total} records
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={!page || page <= 1}
              onClick={() => onPageChange((page ?? 1) - 1)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={!page || page >= totalPages}
              onClick={() => onPageChange((page ?? 1) + 1)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
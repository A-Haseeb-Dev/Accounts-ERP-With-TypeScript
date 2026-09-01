'use client';

import { Loader2, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-12 text-slate-400', className)}>
      <Loader2 className="h-7 w-7 animate-spin" />
    </div>
  );
}

export function EmptyState({ title = 'No records yet', message = 'There is nothing to display here.', action }: { title?: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <SearchX className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="max-w-sm text-xs text-slate-400">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-teal-700" />
    </div>
  );
}
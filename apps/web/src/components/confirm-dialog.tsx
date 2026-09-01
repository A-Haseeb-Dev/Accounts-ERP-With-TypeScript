'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  danger = false,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <div className={cnTs(danger)}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="mt-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{message}</p>
          {children}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function cnTs(danger?: boolean) {
  return danger
    ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600'
    : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600';
}
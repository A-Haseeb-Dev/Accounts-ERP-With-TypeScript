'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DeleteWarnDialog({
  open,
  recordName,
  labels,
  forceable,
  loading,
  onForce,
  onClose,
}: {
  open: boolean;
  recordName: string;
  labels: string[];
  forceable: boolean;
  loading?: boolean;
  onForce: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div
          className={
            forceable
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600'
              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600'
          }
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="mt-4">
          <h3 className="text-base font-semibold text-slate-800">
            {forceable ? 'Related data found' : 'Cannot delete'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {forceable
              ? `"${recordName}" is linked to related records. Deleting it will also permanently delete them:`
              : `"${recordName}" cannot be deleted because related records exist. Deactivate it instead:`}
          </p>
          {labels.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
              {labels.map((l) => (
                <li key={l} className="flex items-start gap-2">
                  <span className="text-slate-400">•</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          {forceable && (
            <Button variant="danger" onClick={onForce} loading={loading}>
              Delete anyway
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
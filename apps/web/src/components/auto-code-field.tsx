'use client';

import { Field, Input } from '@/components/ui/field';

/**
 * Read-only display of the code the server will assign.
 *
 * Codes are not editable: a code is a position in the hierarchy, so a typed one
 * could contradict the parent it is filed under and quietly move an account
 * between statements. When a parent is still being chosen the field says so
 * rather than showing a placeholder that looks like a real code.
 */
export function AutoCodeField({
  code,
  isLoading,
  waitingForParent,
  parentLabel,
}: {
  code: string;
  isLoading?: boolean;
  waitingForParent?: string;
  parentLabel?: string;
}) {
  return (
    <Field
      label="Code"
      required
      hint="Assigned automatically from the chart hierarchy — it cannot be edited."
    >
      <Input
        readOnly
        value={isLoading ? '' : code}
        placeholder={isLoading ? 'Loading…' : waitingForParent ? `Select a ${waitingForParent} to see the code` : '—'}
        className="bg-slate-100 font-mono text-slate-500"
      />
      {parentLabel && code && !isLoading && (
        <p className="mt-1 text-[11px] text-slate-400">{parentLabel}</p>
      )}
    </Field>
  );
}

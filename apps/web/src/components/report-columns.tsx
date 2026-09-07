'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ColumnDef {
  key: string;
  header: string;
}

/**
 * Reads/writes which columns a report shows. Persisted per report in
 * localStorage so each user keeps their own layout across sessions.
 * At least one column always stays selected.
 */
export function useReportColumns(defs: ColumnDef[], storageKey: string) {
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`has-erp:report-cols:${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = defs.filter((d) => (parsed as string[]).includes(d.key)).map((d) => d.key);
          if (valid.length > 0) return valid;
        }
      }
    } catch {
      // ignore malformed storage
    }
    return defs.map((d) => d.key);
  });

  const firstKey = defs[0]?.key;

  const toggle = (key: string) => {
    setVisible((prev) => {
      let next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (next.length === 0 && firstKey) next = [firstKey];
      try {
        localStorage.setItem(`has-erp:report-cols:${storageKey}`, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const isVisible = (key: string) => visible.includes(key);
  const defsFiltered = useMemo(() => defs.filter((d) => visible.includes(d.key)), [defs, visible]);

  return { visible, toggle, isVisible, defsFiltered };
}

export function ColumnPicker({
  defs,
  visible,
  onToggle,
}: {
  defs: ColumnDef[];
  visible: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button type="button" variant="outline" size="md" onClick={() => setOpen((o) => !o)}>
        <Columns className="h-4 w-4" /> Columns
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <p className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Show columns
          </p>
          {defs.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={visible.includes(d.key)}
                onChange={() => onToggle(d.key)}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-600"
              />
              <span>{d.header}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
import { cn } from '@/lib/utils';

type Tone = 'slate' | 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  teal: 'bg-teal-50 text-teal-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
};

export function Badge({ tone = 'slate', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

const statusTone: Record<string, Tone> = {
  active: 'green',
  inactive: 'red',
  draft: 'slate',
  posted: 'teal',
  cancelled: 'red',
  APPROVED: 'green',
};

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge tone="slate">-</Badge>;
  const tone = statusTone[status] ?? 'blue';
  return <Badge tone={tone}>{status}</Badge>;
}
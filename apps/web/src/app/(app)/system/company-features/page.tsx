'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldAlert } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import { QueryError } from '@/components/query-error';
import { PageLoader } from '@/components/ui/spinner';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';
import type { FeatureFlag } from '@/hooks/use-feature-flags';

type Tone = 'slate' | 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const ACTION_TONES: Record<string, Tone> = {
  View: 'blue',
  Create: 'green',
  Update: 'amber',
  Delete: 'red',
  Manage: 'violet',
  Post: 'teal',
  Submit: 'violet',
  Reject: 'amber',
  Cancel: 'red',
  Purge: 'red',
  Print: 'slate',
  Export: 'slate',
  Stock: 'teal',
};

export default function CompanyFeaturesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSystemAdmin =
    (user?.roles?.includes('Developer') ?? false) ||
    (user?.roles?.includes('Super Admin') ?? false);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<FeatureFlag[]>({
    queryKey: ['features'],
    queryFn: () => apiFetch('/system/features'),
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      apiFetch<FeatureFlag[]>('/system/features', {
        method: 'PATCH',
        body: JSON.stringify({ code, enabled }),
      }),
    onSuccess: (next) => qc.setQueryData(['features'], next),
  });

  const bulk = useMutation({
    mutationFn: ({ codes, enabled }: { codes: string[]; enabled: boolean }) =>
      apiFetch<FeatureFlag[]>('/system/features/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ codes, enabled }),
      }),
    onSuccess: (next) => qc.setQueryData(['features'], next),
  });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (data ?? []).filter(
      (f) =>
        !q ||
        f.label.toLowerCase().includes(q) ||
        f.resource.toLowerCase().includes(q) ||
        f.action.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q) ||
        f.group.toLowerCase().includes(q),
    );
    const map = new Map<string, FeatureFlag[]>();
    for (const f of filtered) {
      const arr = map.get(f.group) ?? [];
      arr.push(f);
      map.set(f.group, arr);
    }
    return Array.from(map.entries());
  }, [data, search]);

  if (!isSystemAdmin) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-600" />
        <h2 className="text-lg font-semibold text-slate-800">Developer &amp; Super Admin only</h2>
        <p className="mt-1 text-sm text-slate-600">
          Company feature switches can only be changed by the Developer or Super Admin role.
        </p>
      </div>
    );
  }

  const total = data?.length ?? 0;
  const on = data?.filter((f) => f.enabled).length ?? 0;
  const pending = toggle.isPending || bulk.isPending;

  return (
    <div>
      <PageHeader
        title="Company Features"
        description="Turn any individual action on or off for this company. Disabled actions are blocked for every user except the Developer role - even a Super Admin cannot use them."
        actions={
          <Badge tone={on === total ? 'green' : 'amber'}>
            {on} / {total} enabled
          </Badge>
        }
      />

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search features (e.g. print, voucher, customer)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isError && <QueryError onRetry={() => refetch()} />}
      {isLoading && <PageLoader />}

      {toggle.isError && (
        <p className="mb-3 text-sm text-red-600">
          Could not update the feature switch. Only the Developer role can change company features.
        </p>
      )}

      {data && groups.length === 0 && (
        <p className="text-sm text-slate-500">No features match “{search}”.</p>
      )}

      {groups.map(([group, items]) => {
        const groupOn = items.filter((i) => i.enabled).length;
        const codes = items.map((i) => i.code);
        return (
          <Card key={group} className="mb-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{group}</h3>
                <span className="text-xs text-slate-400">
                  {groupOn}/{items.length} enabled
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || groupOn === items.length}
                  onClick={() => bulk.mutate({ codes, enabled: true })}
                >
                  Enable all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || groupOn === 0}
                  onClick={() => bulk.mutate({ codes, enabled: false })}
                >
                  Disable all
                </Button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map((feature) => (
                <div key={feature.code} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{feature.resource}</span>
                      <Badge tone={ACTION_TONES[feature.action] ?? 'slate'}>{feature.action}</Badge>
                      {feature.enabled ? (
                        <Badge tone="green">On</Badge>
                      ) : (
                        <Badge tone="red">Off</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {feature.description} · <span className="font-mono">{feature.code}</span>
                    </p>
                  </div>
                  <Toggle
                    checked={feature.enabled}
                    disabled={pending}
                    onChange={(enabled) => toggle.mutate({ code: feature.code, enabled })}
                  />
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-teal-600' : 'bg-slate-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

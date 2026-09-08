'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/query-error';
import { PageLoader } from '@/components/ui/spinner';
import { useAuth } from '@/context/auth-context';
import type { FeatureFlag } from '@/hooks/use-feature-flags';

export default function CompanyFeaturesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isDeveloper = user?.roles?.includes('Developer') ?? false;

  const { data, isLoading, isError, refetch } = useQuery<FeatureFlag[]>({
    queryKey: ['features'],
    queryFn: () => apiFetch('/system/features'),
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      apiFetch('/system/features', { method: 'PATCH', body: JSON.stringify({ code, enabled }) }),
    onSuccess: (_data, variables) => {
      qc.setQueryData(['features'], (old: FeatureFlag[] | undefined) =>
        (old ?? []).map((f) => (f.code === variables.code ? { ...f, enabled: variables.enabled } : f)),
      );
      qc.invalidateQueries({ queryKey: ['features'] });
    },
  });

  if (!isDeveloper) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-600" />
        <h2 className="text-lg font-semibold text-slate-800">Developer only</h2>
        <p className="mt-1 text-sm text-slate-600">
          Company feature switches can only be changed by the Developer role.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Company Features"
        description="Turn modules on or off for this company. Disabled modules are blocked for every user except the Developer role - even a Super Admin cannot use them."
      />

      {isError && <QueryError onRetry={() => refetch()} />}
      {isLoading && <PageLoader />}

      {data && (
        <Card className="divide-y divide-slate-100">
          {data.map((feature) => (
            <div key={feature.code} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{feature.label}</h3>
                  {feature.enabled ? (
                    <Badge tone="green">Enabled</Badge>
                  ) : (
                    <Badge tone="red">Disabled</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">{feature.description}</p>
              </div>
              <Toggle
                checked={feature.enabled}
                disabled={toggle.isPending}
                onChange={(enabled) => toggle.mutate({ code: feature.code, enabled })}
              />
            </div>
          ))}
        </Card>
      )}

      {toggle.isError && (
        <p className="mt-3 text-sm text-red-600">
          Could not update the feature switch. Only the Developer role can change company features.
        </p>
      )}
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
      className={cnToggle(checked, disabled)}
    >
      <span
        className={cnThumb(checked)}
      />
    </button>
  );
}

const cnToggle = (checked: boolean, disabled?: boolean) =>
  [
    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-1',
    checked ? 'bg-teal-600' : 'bg-slate-300',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
  ].join(' ');

const cnThumb = (checked: boolean) =>
  [
    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
    checked ? 'translate-x-5' : 'translate-x-0.5',
  ].join(' ');
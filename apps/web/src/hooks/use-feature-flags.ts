'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface FeatureFlag {
  code: string;
  label: string;
  description: string;
  group: string;
  resource: string;
  action: string;
  enabled: boolean;
}

/**
 * Company feature switches (see apps/api/src/features). Every permission in the
 * system is a feature, so the developer can turn any individual action on or off
 * for a company. Used to hide navigation entries and disable UI for switched-off
 * features. The API guard is the real enforcement; this only controls the UI.
 */
export function useFeatureFlags() {
  const { data, isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['features'],
    queryFn: () => apiFetch('/system/features'),
    staleTime: 30_000,
  });

  const features = data ?? [];
  const enabled = new Set(features.filter((f) => f.enabled).map((f) => f.code));
  const disabled = new Set(features.filter((f) => !f.enabled).map((f) => f.code));

  return {
    features,
    isLoading,
    enabled,
    disabled,
    isOn: (code: string) => enabled.has(code),
    isOff: (code: string) => disabled.has(code),
  };
}

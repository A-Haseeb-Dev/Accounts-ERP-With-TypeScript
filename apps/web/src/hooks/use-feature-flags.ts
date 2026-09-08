'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface FeatureFlag {
  code: string;
  label: string;
  description: string;
  enabled: boolean;
}

/**
 * Company feature switches (see apps/api/src/features). Used to hide navigation
 * entries for features the developer has turned off for this company. The API
 * guard is the real enforcement; this only controls what is visible in the UI.
 */
export function useFeatureFlags() {
  const { data, isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['features'],
    queryFn: () => apiFetch('/system/features'),
    staleTime: 30_000,
  });

  const enabled = new Set((data ?? []).filter((f) => f.enabled).map((f) => f.code));

  return {
    features: data ?? [],
    isLoading,
    enabled,
    isOn: (code: string) => enabled.has(code),
  };
}
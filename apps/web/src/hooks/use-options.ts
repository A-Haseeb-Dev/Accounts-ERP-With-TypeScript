'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, qs } from '@/lib/api';

export interface Option {
  value: string;
  label: string;
}

export const FLAT_RESOURCES = [
  'head-accounts',
  'sub-heads',
  'main-accounts',
  'item-types',
  'brands',
  'stock-locations',
  'towns',
  'customers',
  'suppliers',
  'roles',
] as const;

export type FlatResource = (typeof FLAT_RESOURCES)[number];

export function useFlatOptions<T extends { id: string; name?: string | null; code?: string | null; fullName?: string | null }>(
  resource: FlatResource,
): { options: Option[]; data: T[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<T[]>({
    queryKey: ['flat', resource],
    queryFn: () => apiFetch(`/${resource}/flat`),
  });

  const options: Option[] = (data ?? []).map((item) => ({
    value: item.id,
    label: [item.code, item.name ?? item.fullName].filter(Boolean).join(' · '),
  }));

  return { options, data: data ?? [], isLoading };
}

export function useAccountingAccounts() {
  return useFlatOptions('main-accounts');
}

interface ItemBrief {
  id: string;
  code: string;
  name: string;
  purchasePrice?: unknown;
  salePrice?: unknown;
}

export function useItemOptions(): { options: Option[]; data: ItemBrief[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<ItemBrief[]>({
    queryKey: ['items', 'all'],
    queryFn: async () => {
      const res = await apiFetch<{ items: ItemBrief[] }>('/items' + qs({ page: 1, pageSize: 500, status: 'active' }));
      return res.items ?? [];
    },
  });

  const options: Option[] = (data ?? []).map((item) => ({
    value: item.id,
    label: `${item.code} · ${item.name}`,
  }));

  return { options, data: data ?? [], isLoading };
}
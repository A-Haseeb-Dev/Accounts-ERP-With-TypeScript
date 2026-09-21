'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { setAppCurrency } from '@/lib/currency';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data?.currency) setAppCurrency(data.currency);
  }, [data]);

  return <>{children}</>;
}
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, qs } from '@/lib/api';

/**
 * The code the server would assign to the next row, for showing in a create form.
 *
 * Codes belong to the server: it counts each series and knows what it has already
 * issued, so the browser cannot work one out. This is only a preview — the real
 * code is assigned when the row is saved, which is why it is fetched fresh every
 * time the form opens rather than cached.
 *
 * A code cannot be worked out until its parent is known (a sub head's code
 * extends its head's, an account's extends its sub head's), so `params` carries
 * the chosen parent and the query re-runs when it changes. While a required
 * parameter is missing the API has nothing to work from and the code is empty.
 */
export function useNextAccountCode(
  apiPath: string,
  params: Record<string, string | undefined>,
  enabled: boolean,
): { code: string; isLoading: boolean } {
  const dependency = Object.entries(params)
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join('&');

  const { data, isLoading } = useQuery<{ code?: string | null }>({
    queryKey: [apiPath, 'next-code', dependency],
    queryFn: () => apiFetch<{ code?: string | null }>(`${apiPath}/next-code${qs(params)}`),
    enabled,
    staleTime: 0,
  });

  return { code: data?.code ?? '', isLoading };
}

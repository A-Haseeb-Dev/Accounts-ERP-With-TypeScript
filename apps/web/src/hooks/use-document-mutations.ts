'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useDocumentMutations(apiPath: string, listKey: string) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [listKey] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const post = useMutation({
    mutationFn: (id: string) => apiFetch(`/${apiPath}/${id}/post`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/${apiPath}/${id}/cancel`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
    onSuccess: invalidate,
  });

  return { post, cancel };
}
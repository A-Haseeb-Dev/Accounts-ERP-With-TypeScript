'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface Options {
  /** Subject noun used in success messages, e.g. "voucher", "invoice". */
  noun?: string;
}

export function useDocumentMutations(apiPath: string, listKey: string, { noun = 'document' }: Options = {}) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [listKey] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const post = useMutation({
    mutationFn: (id: string) => apiFetch(`/${apiPath}/${id}/post`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast.success(`${noun[0].toUpperCase() + noun.slice(1)} posted`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not post ${noun}`),
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/${apiPath}/${id}/cancel`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      invalidate();
      toast.success(`${noun[0].toUpperCase() + noun.slice(1)} cancelled`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not cancel ${noun}`),
  });

  return { post, cancel };
}
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
  const nounName = noun[0].toUpperCase() + noun.slice(1);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [listKey] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const post = useMutation({
    mutationFn: (id: string) => apiFetch(`/${apiPath}/${id}/post`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast.success(`${nounName} approved / posted`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not post ${noun}`),
  });

  const submit = useMutation({
    mutationFn: (id: string) => apiFetch(`/${apiPath}/${id}/submit`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast.success(`${nounName} submitted for approval`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not submit ${noun}`),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/${apiPath}/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      invalidate();
      toast.success(`${nounName} rejected — back to draft`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not reject ${noun}`),
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/${apiPath}/${id}/cancel`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      invalidate();
      toast.success(`${nounName} cancelled`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not cancel ${noun}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/${apiPath}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast.success(`${nounName} deleted`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not delete ${noun}`),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      apiFetch(`/${apiPath}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      toast.success(`${nounName} updated`);
    },
    onError: (e: Error) => toast.error(e.message || `Could not update ${noun}`),
  });

  return { post, submit, reject, cancel, remove, update };
}
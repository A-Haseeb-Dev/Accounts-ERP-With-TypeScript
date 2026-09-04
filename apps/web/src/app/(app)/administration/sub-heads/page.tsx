'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateTime } from '@/lib/utils';
import type { SubHead, Paginated } from '@/lib/types';

export default function SubHeadsPage() {
  const qc = useQueryClient();
  const { options: headOptions, isLoading: headsLoading } = useFlatOptions('head-accounts');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubHead | null>(null);
  const [form, setForm] = useState<Partial<SubHead>>({});
  const [deleteTarget, setDeleteTarget] = useState<SubHead | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<Paginated<SubHead>>({
    queryKey: ['sub-heads', page, search],
    queryFn: () => apiFetch('/sub-heads' + qs({ page, pageSize: 20, search: search || undefined })),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<SubHead>) =>
      editing?.id
        ? apiFetch(`/sub-heads/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : apiFetch('/sub-heads', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-heads'] });
      setModalOpen(false);
      setEditing(null);
      setForm({});
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/sub-heads/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-heads'] });
      setDeleteTarget(null);
    },
  });

  const set = (name: keyof SubHead | string, value: string | number | undefined) => setForm((f) => ({ ...f, [name]: value }));

  return (
    <div>
      <PageHeader
        title="Sub Heads"
        description="Second level of the chart of accounts hierarchy, grouped under head accounts."
        actions={
          <Button onClick={() => { setEditing(null); setForm({}); setError(''); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> New Sub Head
          </Button>
        }
      />

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search…" className="pl-9" />
          </div>
        </div>
        <DataTable<SubHead>
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.code}</span> },
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
            { key: 'head', header: 'Head Account', render: (r) => <span className="text-slate-500">{r.headAccount?.name ?? '-'}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'updatedAt', header: 'Updated', render: (r) => <span className="text-xs text-slate-400">{dateTime(r.updatedAt)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditing(r); setForm(r); setError(''); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Sub Head' : 'New Sub Head'}>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(form); }}
          className="space-y-4"
        >
          <Field label="Code" required>
            <Input value={form.code ?? ''} onChange={(e) => set('code', e.target.value)} placeholder="e.g. 03" required />
          </Field>
          <Field label="Name" required>
            <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Current Assets" required />
          </Field>
          <Field label="Head Account" required>
            <Select value={form.headAccountId ?? ''} onChange={(e) => set('headAccountId', e.target.value)} disabled={headsLoading} required>
              <option value="">Select head account…</option>
              {headOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status ?? 'active'} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete Sub Head"
        message={`This will permanently delete "${deleteTarget?.name ?? ''}". This action cannot be undone.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}
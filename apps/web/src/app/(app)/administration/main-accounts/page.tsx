'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { dateTime, num } from '@/lib/utils';
import { nextMainAccountCode } from '@/lib/accounts';
import type { MainAccount, SubHead, Paginated } from '@/lib/types';

const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
];

export default function MainAccountsPage() {
  const qc = useQueryClient();
  const { options: subHeadOptions, data: subHeadData, isLoading: subHeadsLoading } = useFlatOptions<SubHead>('sub-heads');
  const { data: allAccounts } = useFlatOptions<MainAccount>('main-accounts');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MainAccount | null>(null);
  const [form, setForm] = useState<Partial<MainAccount>>({});
  const [deleteTarget, setDeleteTarget] = useState<MainAccount | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<Paginated<MainAccount>>({
    queryKey: ['main-accounts', page, search, typeFilter],
    queryFn: () => apiFetch('/main-accounts' + qs({ page, pageSize: 20, search: search || undefined, accountType: typeFilter || undefined })),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<MainAccount>) => {
      const merged: Partial<MainAccount> = { ...payload };
      if (!editing?.id) merged.code = generatedCode || payload.code;
      return editing?.id
        ? apiFetch(`/main-accounts/${editing.id}`, { method: 'PATCH', body: JSON.stringify(merged) })
        : apiFetch('/main-accounts', { method: 'POST', body: JSON.stringify(merged) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['main-accounts'] });
      qc.invalidateQueries({ queryKey: ['flat', 'main-accounts'] });
      setModalOpen(false);
      setEditing(null);
      setForm({});
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/main-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['main-accounts'] });
      qc.invalidateQueries({ queryKey: ['flat', 'main-accounts'] });
      setDeleteTarget(null);
      setDeleteError('');
    },
    onError: (e: Error) => setDeleteError(e.message),
  });

  const set = (name: keyof MainAccount | string, value: string | number | undefined) => setForm((f) => ({ ...f, [name]: value }));

  const selectedSubHead = subHeadData.find((s) => s.id === form.subHeadId);
  const accountCodesUnderSub = allAccounts
    .filter((a) => a.subHeadId === form.subHeadId)
    .map((a) => a.code ?? '');
  const generatedCode =
    editing || !selectedSubHead
      ? form.code ?? ''
      : nextMainAccountCode(selectedSubHead.code, accountCodesUnderSub);

  return (
    <div>
      <PageHeader
        title="Main Accounts"
        description="Leaf accounts in the chart of accounts where voucher entries are posted."
        actions={
          <Button onClick={() => { setEditing(null); setForm({ status: 'active', accountType: 'ASSET' }); setError(''); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> New Main Account
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search…" className="pl-9" />
          </div>
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="w-44">
            <option value="">All types</option>
            {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
        <DataTable<MainAccount>
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.code}</span> },
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
            { key: 'accountType', header: 'Type', render: (r) => <Badge tone={typeTone(r.accountType ?? '')}>{r.accountType ?? ''}</Badge> },
            { key: 'subHead', header: 'Sub Head', render: (r) => <span className="text-slate-500">{r.subHead?.name ?? '-'}</span> },
            { key: 'openingBalance', header: 'Opening', align: 'right', render: (r) => <span className="text-slate-600">{num(r.openingBalance ?? 0)}</span> },
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Main Account' : 'New Main Account'}>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(form); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
          <Field label="Code" required>
            <Input
              value={generatedCode}
              onChange={(e) => set('code', e.target.value)}
              placeholder="auto A1-001-0001"
              required
              disabled={!!selectedSubHead && !editing}
            />
            {!!selectedSubHead && !editing && (
              <p className="mt-1 text-[11px] text-slate-400">Auto-generated from the selected sub head. Clear the sub head to enter manually.</p>
            )}
          </Field>
            <Field label="Name" required>
              <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Petty Cash" required />
            </Field>
          </div>
          <Field label="Sub Head">
            <Select value={form.subHeadId ?? ''} onChange={(e) => set('subHeadId', e.target.value)} disabled={subHeadsLoading}>
              <option value="">—</option>
              {subHeadOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Account Type" required>
            <Select value={form.accountType ?? 'ASSET'} onChange={(e) => set('accountType', e.target.value)}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Opening Balance" hint="Used in trial balance as the starting balance.">
            <Input type="number" step="0.01" value={form.openingBalance ?? 0} onChange={(e) => set('openingBalance', e.target.value === '' ? 0 : Number(e.target.value))} />
          </Field>
          <Field label="Description">
            <Input value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
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
        title="Delete Main Account"
        message={`Delete "${deleteTarget?.name ?? ''}"? Accounts with posting activity cannot be deleted.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={() => { setDeleteError(''); deleteTarget?.id && del.mutate(deleteTarget.id); }}
      >
        {deleteError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</div>
        )}
      </ConfirmDialog>
    </div>
  );
}

function typeTone(type: string): 'teal' | 'amber' | 'blue' | 'green' | 'red' {
  switch (type) {
    case 'ASSET': return 'teal';
    case 'LIABILITY': return 'amber';
    case 'EQUITY': return 'blue';
    case 'REVENUE': return 'green';
    default: return 'red';
  }
}
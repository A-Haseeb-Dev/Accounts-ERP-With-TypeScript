'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { dateTime, money } from '@/lib/utils';
import type { Supplier, Paginated } from '@/lib/types';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { options: townOptions } = useFlatOptions('towns');
  const { options: accountOptions } = useFlatOptions('main-accounts');
  const [search, setSearch] = useState('');
  const [townFilter, setTownFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>({});
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [detailTab, setDetailTab] = useState<'ledger' | 'purchases' | 'returns'>('ledger');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<Paginated<Supplier>>({
    queryKey: ['suppliers', page, search, townFilter],
    queryFn: () => apiFetch('/suppliers' + qs({ page, pageSize: 20, search: search || undefined, townId: townFilter || undefined })),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<Supplier>) =>
      editing?.id
        ? apiFetch(`/suppliers/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : apiFetch('/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['flat', 'suppliers'] });
      setModalOpen(false);
      setEditing(null);
      setForm({});
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['flat', 'suppliers'] });
      setDeleteTarget(null);
    },
  });

  const set = (name: keyof Supplier | string, value: string | number | undefined) => setForm((f) => ({ ...f, [name]: value }));

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Your vendors and their payables ledger."
        actions={<Button onClick={() => { setEditing(null); setForm({ status: 'active' }); setError(''); setModalOpen(true); }}><Plus className="h-4 w-4" /> New Supplier</Button>}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search…" className="pl-9" />
          </div>
          <Select value={townFilter} onChange={(e) => { setTownFilter(e.target.value); setPage(1); }} className="w-48">
            <option value="">All towns</option>
            {townOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <DataTable<Supplier>
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.code}</span> },
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
            { key: 'phone', header: 'Phone', render: (r) => <span className="text-slate-500">{r.phone || '-'}</span> },
            { key: 'town', header: 'Town', render: (r) => <span className="text-slate-500">{r.town?.name ?? '-'}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'updatedAt', header: 'Updated', render: (r) => <span className="text-xs text-slate-400">{dateTime(r.updatedAt)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-1">
                  <button onClick={() => { setDetail(r); setDetailTab('ledger'); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"><Eye className="h-4 w-4" /></button>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Supplier' : 'New Supplier'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" hint="Leave blank to auto-generate."><Input value={form.code ?? ''} onChange={(e) => set('code', e.target.value)} placeholder="Auto-generated" /></Field>
            <Field label="Name" required><Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone"><Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Town">
              <Select value={form.townId ?? ''} onChange={(e) => set('townId', e.target.value)}>
                <option value="">—</option>
                {townOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Address"><Textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Payable Account" hint="Defaults to the shared payable control account.">
              <Select value={form.mainAccountId ?? ''} onChange={(e) => set('mainAccountId', e.target.value)}>
                <option value="">—</option>
                {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Opening Balance">
              <Input type="number" step="0.01" value={form.openingBalance ?? 0} onChange={(e) => set('openingBalance', e.target.value === '' ? 0 : Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Description"><Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
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

      <SupplierDetail supplier={detail} tab={detailTab} onTab={setDetailTab} onClose={() => setDetail(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete Supplier"
        message={`This will permanently delete "${deleteTarget?.name ?? ''}". This action cannot be undone.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function SupplierDetail({
  supplier,
  tab,
  onTab,
  onClose,
}: {
  supplier: Supplier | null;
  tab: 'ledger' | 'purchases' | 'returns';
  onTab: (t: 'ledger' | 'purchases' | 'returns') => void;
  onClose: () => void;
}) {
  const id = supplier?.id ?? '';

  const { data: ledger, isLoading: ledgerLoading } = useQuery<{ items: { id: string; date: string; voucherNumber: string; debit: number; credit: number; balance: number; description: string }[] }>({
    queryKey: ['supplier-ledger', id],
    queryFn: () => apiFetch(`/suppliers/${id}/ledger${qs({ pageSize: 100 })}`),
    enabled: !!id,
  });

  const { data: purchases } = useQuery<{ items: { id: string; number: string; purchaseDate: string; grandTotal: number; status: string }[] }>({
    queryKey: ['supplier-purchases', id],
    queryFn: () => apiFetch(`/suppliers/${id}/purchases${qs({ pageSize: 20 })}`),
    enabled: !!id,
  });

  return (
    <Modal open={!!supplier} onClose={onClose} title={`Supplier: ${supplier?.name ?? ''}`} size="lg">
      {!supplier ? null : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <LabelValue label="Code" value={supplier.code} />
            <LabelValue label="Phone" value={supplier.phone || '-'} />
            <LabelValue label="Town" value={supplier.town?.name ?? '-'} />
            <LabelValue label="Opening" value={money(supplier.openingBalance, 'PKR')} />
          </div>

          <div className="mb-4 flex gap-1 border-b border-slate-200">
            {(['ledger', 'purchases', 'returns'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onTab(t)}
                className={tab === t ? 'border-b-2 border-teal-600 px-3 py-2 text-sm font-medium text-teal-700' : 'border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-700'}
              >
                {t === 'ledger' ? 'Ledger' : t === 'purchases' ? 'Purchases' : 'Returns'}
              </button>
            ))}
          </div>

          {tab === 'ledger' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Date</th><th className="px-3 py-2">Voucher</th><th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? <tr><td colSpan={6}><Spinner className="py-8" /></td></tr> : (ledger?.items ?? []).map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{new Date(e.date).toLocaleDateString('en-GB')}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">{e.voucherNumber}</td>
                      <td className="px-3 py-2 text-slate-500">{e.description ?? '-'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{money(e.debit)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{money(e.credit)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{money(e.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'purchases' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(purchases?.items ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-slate-700">{p.number}</td>
                      <td className="px-3 py-2 text-slate-600">{new Date(p.purchaseDate).toLocaleDateString('en-GB')}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{money(p.grandTotal)}</td>
                      <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'returns' && <p className="py-8 text-center text-sm text-slate-400">Returns history will appear here once posted.</p>}
        </div>
      )}
    </Modal>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
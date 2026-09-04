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
import { StatusBadge, Badge } from '@/components/ui/badge';
import { dateTime, money } from '@/lib/utils';
import type { Item, Paginated } from '@/lib/types';

export default function ItemsPage() {
  const qc = useQueryClient();
  const { options: typeOptions } = useFlatOptions('item-types');
  const { options: brandOptions } = useFlatOptions('brands');
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Partial<Item>>({});
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<Paginated<Item>>({
    queryKey: ['items', page, search],
    queryFn: () => apiFetch('/items' + qs({ page, pageSize: 20, search: search || undefined })),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<Item>) =>
      editing?.id
        ? apiFetch(`/items/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : apiFetch('/items', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['flat', 'items'] });
      setModalOpen(false);
      setEditing(null);
      setForm({});
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['flat', 'items'] });
      setDeleteTarget(null);
    },
  });

  const set = (name: keyof Item | string, value: string | number | undefined) => setForm((f) => ({ ...f, [name]: value }));

  return (
    <div>
      <PageHeader
        title="Items"
        description="Products / SKUs tracked in inventory with pricing and stock levels."
        actions={
          <Button onClick={() => { setEditing(null); setForm({ status: 'active' }); setError(''); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> New Item
          </Button>
        }
      />

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or code…" className="pl-9" />
          </div>
        </div>
        <DataTable<Item>
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.code}</span> },
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
            { key: 'type', header: 'Type', render: (r) => <span className="text-slate-500">{r.itemType?.name ?? '-'}</span> },
            { key: 'brand', header: 'Brand', render: (r) => <span className="text-slate-500">{r.brand?.name ?? '-'}</span> },
            { key: 'unit', header: 'Unit', render: (r) => <span className="text-slate-500">{r.unit || '-'}</span> },
            { key: 'purchasePrice', header: 'Purchase', align: 'right', render: (r) => <span className="text-slate-600">{money(r.purchasePrice, 'PKR')}</span> },
            { key: 'salePrice', header: 'Sale', align: 'right', render: (r) => <span className="font-medium text-teal-700">{money(r.salePrice, 'PKR')}</span> },
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Item' : 'New Item'} size="lg">
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(form); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" required>
              <Input value={form.code ?? ''} onChange={(e) => set('code', e.target.value)} placeholder="e.g. SKU-001" required />
            </Field>
            <Field label="Name" required>
              <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Soft Drink 250ml" required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Barcode">
              <Input value={form.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} />
            </Field>
            <Field label="Unit">
              <Input value={form.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="pcs / kg" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Item Type">
              <Select value={form.itemTypeId ?? ''} onChange={(e) => set('itemTypeId', e.target.value)}>
                <option value="">—</option>
                {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Brand">
              <Select value={form.brandId ?? ''} onChange={(e) => set('brandId', e.target.value)}>
                <option value="">—</option>
                {brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Purchase Price">
              <Input type="number" step="0.01" value={form.purchasePrice ?? ''} onChange={(e) => set('purchasePrice', e.target.value === '' ? undefined : Number(e.target.value))} />
            </Field>
            <Field label="Sale Price">
              <Input type="number" step="0.01" value={form.salePrice ?? ''} onChange={(e) => set('salePrice', e.target.value === '' ? undefined : Number(e.target.value))} />
            </Field>
            <Field label="Min Stock">
              <Input type="number" value={form.minStockLevel ?? ''} onChange={(e) => set('minStockLevel', e.target.value === '' ? undefined : Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Default Stock Location">
            <Select value={form.defaultLocationId ?? ''} onChange={(e) => set('defaultLocationId', e.target.value)}>
              <option value="">—</option>
              {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        title="Delete Item"
        message={`This will permanently delete "${deleteTarget?.name ?? ''}". This action cannot be undone.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShieldX,
  Trash2,
  XCircle,
} from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions, useItemOptions } from '@/hooks/use-options';
import { useDocumentMutations } from '@/hooks/use-document-mutations';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateOnly, money } from '@/lib/utils';
import { toast } from 'sonner';
import type { DeliveryOrder, Paginated, Sale } from '@/lib/types';

const RESOURCE = 'sales/delivery-orders';

interface DoLine {
  key: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  saleItemId?: string | null;
}

const newLine = (): DoLine => ({
  key: Math.random().toString(36).slice(2, 9),
  itemId: '',
  quantity: 1,
  unitPrice: 0,
});

export default function DeliveryOrdersPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('sales.delivery-order.create');
  const canPost = can('sales.delivery-order.post');
  const canSubmitAction = can('sales.delivery-order.submit');
  const canReject = can('sales.delivery-order.reject');
  const canUpdate = can('sales.delivery-order.update');
  const canDelete = can('sales.delivery-order.delete');
  const canCancel = can('sales.delivery-order.cancel');

  const { options: customerOptions } = useFlatOptions('customers');
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const { options: itemOptions, data: itemData } = useItemOptions();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<DoLine[]>([]);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DeliveryOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rejectTarget, setRejectTarget] = useState<DeliveryOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeliveryOrder | null>(null);

  const { post, submit, reject, cancel, remove } = useDocumentMutations(RESOURCE, RESOURCE, {
    noun: 'delivery order',
  });

  const { data, isLoading } = useQuery<Paginated<DeliveryOrder>>({
    queryKey: [RESOURCE, page, search, status],
    queryFn: () => apiFetch(RESOURCE + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<DeliveryOrder | null>({
    queryKey: [RESOURCE, 'detail', detailId],
    queryFn: () => apiFetch(`${RESOURCE}/${detailId}`),
    enabled: !!detailId,
  });

  // Invoices that can still be dispatched. A cancelled invoice is never
  // offered, and the API rejects it anyway.
  const { data: invoices } = useQuery<Paginated<Sale>>({
    queryKey: ['sales', 'for-delivery-orders'],
    queryFn: () => apiFetch('/sales' + qs({ page: 1, pageSize: 100, status: 'posted' })),
  });

  const selectedSaleId = String(form.saleId ?? '');
  const { data: selectedSale } = useQuery<Sale | null>({
    queryKey: ['sales', 'detail', selectedSaleId],
    queryFn: () => apiFetch(`/sales/${selectedSaleId}`),
    enabled: !!selectedSaleId,
  });

  const { data: nextNumber } = useQuery<string>({
    queryKey: [RESOURCE, 'next-number'],
    queryFn: () => apiFetch<{ number: string }>(`${RESOURCE}/next-number`).then((r) => r.number),
    enabled: modalOpen,
    staleTime: 0,
  });

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch<DeliveryOrder>(RESOURCE, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RESOURCE] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      setModalOpen(false);
      setEditId(null);
      setForm({});
      setLines([]);
      toast.success('Delivery order saved');
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not save delivery order');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      apiFetch<DeliveryOrder>(`${RESOURCE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RESOURCE] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      setModalOpen(false);
      setEditId(null);
      setForm({});
      setLines([]);
      toast.success('Delivery order updated');
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not update delivery order');
    },
  });

  // Picking an invoice fills the order with what that invoice still owes, so
  // the warehouse ships the right goods without typing them again.
  useEffect(() => {
    if (!selectedSale) return;
    const owed = (selectedSale.items ?? [])
      .map((it) => ({
        key: Math.random().toString(36).slice(2, 9),
        itemId: it.itemId,
        quantity: Number(it.quantity) - Number(it.deliveredQuantity ?? 0),
        unitPrice: Number(it.unitPrice ?? 0),
        saleItemId: it.id,
      }))
      .filter((l) => l.quantity > 0);
    if (owed.length) setLines(owed);
    setForm((f) => ({
      ...f,
      customerId: selectedSale.customerId,
      stockLocationId: selectedSale.stockLocationId,
    }));
  }, [selectedSale]);

  const openCreate = () => {
    setEditId(null);
    setForm({
      deliveryDate: new Date().toISOString().slice(0, 10),
      saleId: '',
      customerId: '',
      stockLocationId: '',
      reference: '',
      deliveryTo: '',
      vehicleNo: '',
      driverName: '',
      driverPhone: '',
      note: '',
    });
    setLines([newLine()]);
    setError('');
    setModalOpen(true);
  };

  const startEdit = (record: DeliveryOrder) => {
    setForm({
      deliveryDate: dateOnly(record.deliveryDate),
      saleId: record.saleId ?? '',
      customerId: record.customerId ?? '',
      stockLocationId: record.stockLocationId ?? '',
      reference: record.reference ?? '',
      deliveryTo: record.deliveryTo ?? '',
      vehicleNo: record.vehicleNo ?? '',
      driverName: record.driverName ?? '',
      driverPhone: record.driverPhone ?? '',
      note: record.note ?? '',
    });
    setLines(
      (record.items ?? []).map((it) => ({
        key: it.id,
        itemId: it.itemId,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice ?? 0),
        saleItemId: it.saleItemId ?? null,
      })),
    );
    setEditId(record.id);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const valid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (!valid.length) {
      setError('Add at least one item line with a quantity.');
      return;
    }
    const payload = {
      deliveryDate: form.deliveryDate ? String(form.deliveryDate) : undefined,
      saleId: form.saleId ? String(form.saleId) : undefined,
      customerId: form.customerId ? String(form.customerId) : undefined,
      stockLocationId: form.stockLocationId ? String(form.stockLocationId) : undefined,
      reference: form.reference || undefined,
      deliveryTo: form.deliveryTo || undefined,
      vehicleNo: form.vehicleNo || undefined,
      driverName: form.driverName || undefined,
      driverPhone: form.driverPhone || undefined,
      note: form.note || undefined,
      items: valid.map((l) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice ?? 0),
        ...(l.saleItemId ? { saleItemId: l.saleItemId } : {}),
      })),
    };
    if (editId) update.mutate({ id: editId, payload });
    else create.mutate(payload);
  };

  const setLine = (key: string, patch: Partial<DoLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onItemChange = (key: string, itemId: string) => {
    const item = itemData.find((i) => i.id === itemId);
    setLine(key, { itemId, unitPrice: item ? Number(item.salePrice ?? 0) : 0 });
  };

  const total = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice ?? 0), 0),
    [lines],
  );

  const canSave = lines.some((l) => l.itemId && Number(l.quantity) > 0);

  return (
    <div>
      <PageHeader
        title="Delivery Orders"
        description="The warehouse record of goods leaving for a customer. An invoice can be delivered in parts."
        actions={
          canCreate && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New Delivery Order
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search number / customer / vehicle…"
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending approval</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <DataTable<DeliveryOrder>
          columns={[
            { key: 'number', header: 'Number', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.number}</span> },
            { key: 'deliveryDate', header: 'Date', render: (r) => <span className="text-slate-600">{dateOnly(r.deliveryDate)}</span> },
            { key: 'customer', header: 'Customer', render: (r) => <span className="text-slate-700">{r.customer?.name ?? '-'}</span> },
            {
              key: 'sale',
              header: 'Invoice',
              render: (r) => (r.sale ? <span className="font-mono text-xs text-slate-600">{r.sale.number}</span> : <span className="text-xs text-slate-300">Standalone</span>),
            },
            { key: 'vehicleNo', header: 'Vehicle', render: (r) => <span className="text-slate-600">{r.vehicleNo ?? '-'}</span> },
            { key: 'items', header: 'Items', align: 'right', render: (r) => <span className="text-slate-600">{(r.items ?? []).length}</span> },
            { key: 'grandTotal', header: 'Value', align: 'right', render: (r) => <span className="tabular-nums text-slate-700">{money(r.grandTotal ?? 0)}</span> },
            {
              key: 'stockRelieved',
              header: 'Stock',
              render: (r) =>
                r.status === 'posted' ? (
                  r.stockRelieved ? (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">Relieved here</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">By invoice</span>
                  )
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                ),
            },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions',
              header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setDetailId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View">
                    <Eye className="h-4 w-4" />
                  </button>
                  {r.status === 'draft' && (
                    <>
                      {canSubmitAction && (
                        <button onClick={() => submit.mutate(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" title="Submit for approval">
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {canPost && (
                        <button onClick={() => post.mutate(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700" title="Post - goods leave the warehouse">
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {canCancel && (
                        <button onClick={() => { setCancelTarget(r); setCancelReason(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Cancel">
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                  {r.status === 'pending' && (
                    <>
                      {canPost && (
                        <button onClick={() => post.mutate(r.id)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50 hover:text-teal-700" title="Approve">
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      )}
                      {canReject && (
                        <button onClick={() => { setRejectTarget(r); setRejectReason(''); }} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-600" title="Reject">
                          <ShieldX className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                  {canUpdate && r.status === 'draft' && (
                    <button onClick={() => startEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="Edit">
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && r.status !== 'cancelled' && (
                    <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title={r.status === 'posted' ? 'Delete (returns the stock)' : 'Delete'}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit Delivery Order' : 'New Delivery Order'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Delivery Date" required>
                  <Input type="date" value={String(form.deliveryDate ?? '')} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} required />
                </Field>
                <Field label="DO Number">
                  <Input value={nextNumber ?? ''} disabled className="font-mono" title="Auto-generated on save" />
                </Field>
                <Field label="Sales Invoice" hint="Pick the invoice this dispatch settles. Its unpaid lines are loaded automatically.">
                  <Select
                    value={String(form.saleId ?? '')}
                    onChange={(e) => setForm((f) => ({ ...f, saleId: e.target.value }))}
                  >
                    <option value="">Standalone dispatch (no invoice)</option>
                    {(invoices?.items ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.number} · {s.customer?.name ?? ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Customer" required={!form.saleId}>
                  <Select
                    value={String(form.customerId ?? '')}
                    onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                    required={!form.saleId}
                  >
                    <option value="">Select customer…</option>
                    {customerOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Stock Location" required={!form.saleId}>
                  <Select
                    value={String(form.stockLocationId ?? '')}
                    onChange={(e) => setForm((f) => ({ ...f, stockLocationId: e.target.value }))}
                    required={!form.saleId}
                  >
                    <option value="">Select location…</option>
                    {locationOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reference">
                  <Input value={String(form.reference ?? '')} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Customer's own reference" />
                </Field>
              </div>

              <div>
                <p className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Dispatch
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Deliver To">
                    <Input value={String(form.deliveryTo ?? '')} onChange={(e) => setForm((f) => ({ ...f, deliveryTo: e.target.value }))} placeholder="Address / site" />
                  </Field>
                  <Field label="Vehicle No">
                    <Input value={String(form.vehicleNo ?? '')} onChange={(e) => setForm((f) => ({ ...f, vehicleNo: e.target.value }))} placeholder="e.g. LEA-1234" />
                  </Field>
                  <Field label="Driver">
                    <Input value={String(form.driverName ?? '')} onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))} placeholder="Driver name" />
                  </Field>
                  <Field label="Driver Phone">
                    <Input value={String(form.driverPhone ?? '')} onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))} placeholder="03xx-xxxxxxx" />
                  </Field>
                </div>
              </div>

              <div>
                <p className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Items
                </p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 w-28 text-right">Qty</th>
                        <th className="px-3 py-2 w-32 text-right">Unit Price</th>
                        <th className="px-3 py-2 w-24 text-right">Amount</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.key} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2">
                            <Select value={l.itemId} onChange={(e) => onItemChange(l.key, e.target.value)}>
                              <option value="">Select item…</option>
                              {itemOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="text-right"
                              value={l.quantity}
                              onChange={(e) => setLine(l.key, { quantity: Number(e.target.value) || 0 })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="text-right"
                              value={l.unitPrice}
                              onChange={(e) => setLine(l.key, { unitPrice: Number(e.target.value) || 0 })}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {money(Number(l.quantity) * Number(l.unitPrice ?? 0))}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-400">No lines.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setLines((prev) => [...prev, newLine()])}>
                  <Plus className="h-4 w-4" /> Add line
                </Button>
              </div>

              <div>
                <p className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Note</p>
                <Textarea value={String(form.note ?? '')} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional notes…" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Order value</p>
                <div className="flex items-center justify-between border-t-2 border-slate-800 pt-2.5">
                  <span className="text-sm font-semibold text-slate-800">Total</span>
                  <span className="text-lg font-bold tabular-nums text-slate-900">{money(total)}</span>
                </div>
                <p className="text-[11px] leading-snug text-slate-400">
                  Posting this order takes the goods out of the warehouse. If the invoice was already
                  posted, the invoice relieved the stock and this order only records the dispatch.
                </p>
              </div>
            </div>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSave} loading={create.isPending || update.isPending}>
              {editId ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail?.number ?? 'Delivery Order'} size="lg">
        {detailLoading || !detail ? null : (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact label="Date" value={dateOnly(detail.deliveryDate)} />
              <Fact label="Customer" value={detail.customer?.name ?? '-'} />
              <Fact label="Invoice" value={detail.sale?.number ?? 'Standalone'} />
              <Fact label="Location" value={detail.stockLocation?.name ?? '-'} />
              <Fact label="Deliver to" value={detail.deliveryTo ?? '-'} />
              <Fact label="Vehicle" value={detail.vehicleNo ?? '-'} />
              <Fact label="Driver" value={detail.driverName ? `${detail.driverName}${detail.driverPhone ? ` · ${detail.driverPhone}` : ''}` : '-'} />
              <Fact label="Status" value={detail.status.toUpperCase()} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items ?? []).map((it) => (
                    <tr key={it.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-800">
                        {it.item?.name ?? it.itemId}{' '}
                        <span className="text-xs text-slate-400">({it.item?.code ?? ''})</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{it.quantity}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{money(it.unitPrice ?? 0)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{money(it.lineTotal ?? 0)}</td>
                    </tr>
                  ))}
                  {(detail.items ?? []).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No lines.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between font-semibold text-slate-800">
                <span>Total</span><span>{money(detail.grandTotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Stock</span>
                <span>
                  {detail.status !== 'posted'
                    ? 'Not yet out of the warehouse'
                    : detail.stockRelieved
                      ? 'Relieved by this order'
                      : 'Relieved by the invoice'}
                </span>
              </div>
            </div>

            {!!detail.note && <p className="mt-3 text-xs text-slate-500">Note: {detail.note}</p>}
            {!!detail.cancelReason && (
              <p className="mt-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
                Cancelled: {detail.cancelReason}
              </p>
            )}
            {!!detail.rejectReason && (
              <p className="mt-1 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                Rejected: {detail.rejectReason}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        danger
        title="Cancel delivery order"
        message="Cancelling a posted order brings the goods back into the stock and cancels its voucher. This cannot be undone."
        confirmLabel="Cancel order"
        loading={cancel.isPending}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget?.id && cancel.mutate({ id: cancelTarget.id, reason: cancelReason || 'Cancelled from UI' })}
      >
        <div className="mt-3">
          <Field label="Reason">
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Optional reason" />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejectTarget}
        danger
        title="Reject for approval"
        message="The delivery order returns to draft. The owner can edit and resubmit it."
        confirmLabel="Reject"
        loading={reject.isPending}
        onCancel={() => setRejectTarget(null)}
        onConfirm={() => rejectTarget?.id && reject.mutate({ id: rejectTarget.id, reason: rejectReason || 'Rejected' })}
      >
        <div className="mt-3">
          <Field label="Reason" required>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this being rejected?" required />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete delivery order"
        message={
          deleteTarget?.status === 'posted'
            ? `Deletes ${deleteTarget?.number ?? 'this order'} and returns the dispatched goods to the stock. This cannot be undone.`
            : 'This permanently removes the draft delivery order.'
        }
        confirmLabel="Delete"
        loading={remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

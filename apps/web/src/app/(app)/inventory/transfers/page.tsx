'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckCircle2, Eye, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions, useItemOptions } from '@/hooks/use-options';
import { useDocumentMutations } from '@/hooks/use-document-mutations';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateTime } from '@/lib/utils';

type Row = Record<string, unknown>;

interface TransferLine {
  key: string;
  itemId?: string;
  itemName?: string;
  quantity: number;
}

export default function StockTransfersPage() {
  const qc = useQueryClient();
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const { options: itemOptions } = useItemOptions();
  const { post, cancel } = useDocumentMutations('stock-transfers', 'stock-transfers', { noun: 'transfer' });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading } = useQuery<{ items: Row[]; total: number }>({
    queryKey: ['stock-transfers', page, search, status],
    queryFn: () => apiFetch('/stock-transfers' + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<Row>({
    queryKey: ['stock-transfer', detailId],
    queryFn: () => apiFetch(`/stock-transfers/${detailId}`),
    enabled: !!detailId,
  });

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/stock-transfers', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      setModalOpen(false);
      setLines([]);
      setNote('');
      setFromId('');
      setToId('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fromId || !toId || fromId === toId) {
      setError('Choose two different locations.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one item line.');
      return;
    }
    create.mutate({
      transferDate: date,
      fromLocationId: fromId,
      toLocationId: toId,
      note,
      items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    });
  };

  const addLine = () => setLines((ls) => [...ls, { key: crypto.randomUUID?.() ?? String(Date.now()), quantity: 1 }]);
  const update = (key: string, patch: Partial<TransferLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const detailLines = (detail?.items as unknown as { item: { code: string; name: string }; quantity: number }[] | undefined) ?? [];

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        description="Move quantities between your stock locations."
        actions={
          <Button onClick={() => { setDate(new Date().toISOString().slice(0, 10)); setLines([]); setError(''); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> New Transfer
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search number / location…" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <DataTable<Row>
          columns={[
            { key: 'number', header: 'Number', render: (r) => <span className="font-mono font-semibold text-slate-800">{String(r.number)}</span> },
            { key: 'transferDate', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(String(r.transferDate)).toLocaleDateString('en-GB')}</span> },
            { key: 'fromLocation', header: 'From', render: (r) => <span className="text-slate-700">{String((r.fromLocation as Row)?.name ?? '-')}</span> },
            { key: 'toLocation', header: 'To', render: (r) => <span className="text-slate-700">{String((r.toLocation as Row)?.name ?? '-')}</span> },
            { key: 'items', header: 'Lines', align: 'right', render: (r) => <span className="text-slate-600">{(r.items as unknown[] | undefined)?.length ?? 0}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'createdAt', header: 'Created', render: (r) => <span className="text-xs text-slate-400">{dateTime(r.createdAt)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setDetailId(String(r.id))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View"><Eye className="h-4 w-4" /></button>
                  {String(r.status) === 'draft' && (
                    <>
                      <button onClick={() => post.mutate(String(r.id))} className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700" title="Post"><CheckCircle2 className="h-4 w-4" /></button>
                      <button onClick={() => { setCancelTarget(r); setCancelReason(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Cancel"><XCircle className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => String(r.id)}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Stock Transfer" size="lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Transfer Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="From Location" required>
              <Select value={fromId} onChange={(e) => setFromId(e.target.value)} required>
                <option value="">Select…</option>
                {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="To Location" required>
              <Select value={toId} onChange={(e) => setToId(e.target.value)} required>
                <option value="">Select…</option>
                {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Items</p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="w-24 px-3 py-2 text-right">Qty</th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-1.5">
                        <Select value={l.itemId ?? ''} onChange={(e) => {
                          const opt = itemOptions.find((o) => o.value === e.target.value);
                          update(l.key, { itemId: e.target.value, itemName: opt?.label });
                        }} className="min-w-[200px]">
                          <option value="">Select item…</option>
                          {itemOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min={1} value={String(l.quantity)} onChange={(e) => update(l.key, { quantity: Number(e.target.value) || 0 })} className="text-right" />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button onClick={() => remove(l.key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">No lines yet — add an item.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addLine} className="mt-2"><Plus className="h-4 w-4" /> Add line</Button>
          </div>

          <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={`${detail?.number ?? ''}`} size="lg">
        {detailLoading || !detail ? null : (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <KV label="Date" value={new Date(String(detail.transferDate)).toLocaleDateString('en-GB')} />
              <KV label="From" value={String((detail.fromLocation as Row)?.name ?? '-')} />
              <KV label="To" value={String((detail.toLocation as Row)?.name ?? '-')} />
              <KV label="Status" value={String(detail.status)} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLines.map((it) => (
                    <tr key={String((it.item as Row | null)?.code ?? it.id ?? 'line')} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{String((it.item as Row | null)?.name ?? it.itemId ?? '—')} <span className="text-xs text-slate-400">({String((it.item as Row | null)?.code ?? '')})</span></td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{it.quantity}</td>
                    </tr>
                  ))}
                  {detailLines.length === 0 && <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400">No lines.</td></tr>}
                </tbody>
              </table>
            </div>
            {!!detail.note && <p className="mt-3 text-xs text-slate-500">Note: {String(detail.note)}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        danger
        title="Cancel Stock Transfer"
        message="Cancelling reverts this transfer's stock effects. This cannot be undone."
        confirmLabel="Cancel transfer"
        loading={cancel.isPending}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget?.id && cancel.mutate({ id: String(cancelTarget.id), reason: cancelReason || 'Cancelled from UI' })}
      >
        <div className="mt-3">
          <Field label="Reason">
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Optional reason" />
          </Field>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, Plus, Search, XCircle } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useItemOptions } from '@/hooks/use-options';
import { ItemsEditor, type LineItem } from '@/components/tx/items-editor';
import { useDocumentMutations } from '@/hooks/use-document-mutations';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateTime, money } from '@/lib/utils';
import type { Option } from '@/hooks/use-options';

type Row = Record<string, unknown>;

export interface DocLine {
  item: { code: string; name: string };
  quantity: number;
  unitCost: number;
  unitPrice: number;
}

export interface DocumentConfig {
  resource: string;
  title: string;
  description: string;
  dateField: string;
  partyLabel: string;
  partyParam: string;
  partyOptions: Option[];
  priceKey: 'unitCost' | 'unitPrice';
  locationOptions: Option[];
  showAmountPaid?: boolean;
  itemLineField: string;
  newLabel?: string;
}

export function DocumentPage({ config }: { config: DocumentConfig }) {
  const {
    resource, title, description, dateField, partyLabel, partyParam,
    partyOptions, priceKey, locationOptions, showAmountPaid,
  } = config;

  const qc = useQueryClient();
  const { options: itemOptions } = useItemOptions();
  const { post, cancel } = useDocumentMutations(resource, resource);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<LineItem[]>([]);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading } = useQuery<{ items: Row[]; total: number }>({
    queryKey: [resource, page, search, status],
    queryFn: () => apiFetch(`/${resource}` + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<Record<string, unknown> | null>({
    queryKey: [resource, 'detail', detailId],
    queryFn: () => apiFetch(`/${resource}/${detailId}`),
    enabled: !!detailId,
  });

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch(`/${resource}`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      setModalOpen(false);
      setForm({});
      setLines([]);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (lines.length === 0) {
      setError('Add at least one item line.');
      return;
    }
    const items = lines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      [config.itemLineField]: l.price,
    }));
    create.mutate({
      [dateField]: form[dateField],
      reference: form.reference,
      note: form.note,
      [partyParam]: form[partyParam],
      stockLocationId: form.stockLocationId,
      discount: Number(form.discount ?? 0),
      tax: Number(form.tax ?? 0),
      ...(showAmountPaid ? { amountPaid: Number(form.amountPaid ?? 0) } : {}),
      items,
    });
  };

  const grandTotal = useMemo(() => {
    const sub = lines.reduce((s, l) => s + l.quantity * l.price, 0);
    return sub - Number(form.discount ?? 0) + Number(form.tax ?? 0);
  }, [lines, form.discount, form.tax]);

  const partyField = partyParam;

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button
            onClick={() => {
              setForm({ [dateField]: new Date().toISOString().slice(0, 10), [partyField]: '', stockLocationId: '' });
              setLines([]);
              setError('');
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New {config.newLabel ?? 'Document'}
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={`Search number / ${partyLabel.toLowerCase()}…`} className="pl-9" />
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
            { key: dateField, header: 'Date', render: (r) => <span className="text-slate-600">{new Date(String(r[dateField])).toLocaleDateString('en-GB')}</span> },
            { key: 'party', header: partyLabel, render: (r) => {
              const raw = r[partyField] ?? r.customer ?? r.supplier;
              return <span className="text-slate-700">{typeof raw === 'object' && raw ? String((raw as Row).name) : '-'}</span>;
            } },
            { key: 'grandTotal', header: 'Total', align: 'right', render: (r) => <span className="font-medium text-slate-800">{money(r.grandTotal, 'PKR')}</span> },
            ...(showAmountPaid ? [{ key: 'amountPaid', header: 'Paid', align: 'right' as const, render: (r: Row) => <span className="text-slate-500">{money(r.amountPaid, 'PKR')}</span> }] : []),
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`New ${title}`} size="lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={`${dateField === 'returnDate' ? 'Return' : title.replace(/s$/,'')} Date`} required>
              <Input type="date" value={String(form[dateField] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [dateField]: e.target.value }))} required />
            </Field>
            <Field label="Reference">
              <Input value={String(form.reference ?? '')} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="party invoice #" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={partyLabel} required>
              <Select value={String(form[partyField] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [partyField]: e.target.value }))} required>
                <option value="">Select {partyLabel.toLowerCase()}…</option>
                {partyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Stock Location" required>
              <Select value={String(form.stockLocationId ?? '')} onChange={(e) => setForm((f) => ({ ...f, stockLocationId: e.target.value }))} required>
                <option value="">Select location…</option>
                {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Items</p>
            <ItemsEditor items={lines} onChange={setLines} itemOptions={itemOptions} priceKey={priceKey} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Discount"><Input type="number" step="0.01" value={String(form.discount ?? 0)} onChange={(e) => setForm((f) => ({ ...f, discount: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Tax"><Input type="number" step="0.01" value={String(form.tax ?? 0)} onChange={(e) => setForm((f) => ({ ...f, tax: Number(e.target.value) || 0 }))} /></Field>
            <Field label="Grand Total">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-semibold text-slate-800">{money(grandTotal, 'PKR')}</div>
            </Field>
          </div>
          {showAmountPaid && (
            <Field label="Amount Paid">
              <Input type="number" step="0.01" value={String(form.amountPaid ?? 0)} onChange={(e) => setForm((f) => ({ ...f, amountPaid: Number(e.target.value) || 0 }))} />
            </Field>
          )}
          <Field label="Note"><Textarea value={String(form.note ?? '')} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></Field>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      <DocumentDetailModal
        open={!!detailId}
        loading={detailLoading}
        detail={detail}
        priceKey={priceKey}
        itemLineField={config.itemLineField}
        dateField={dateField}
        partyLabel={partyLabel}
        showAmountPaid={!!showAmountPaid}
        onClose={() => setDetailId(null)}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        danger
        title={`Cancel ${title.replace(/s$/, '')}`}
        message="Cancelling removes this document's stock and accounting effects. This cannot be undone."
        confirmLabel={`Cancel ${title.replace(/s$/, '')}`}
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

function kvName(obj: unknown): string {
  return obj && typeof obj === 'object' ? String((obj as Row).name ?? '') : '';
}

function DocumentDetailModal({
  open,
  loading,
  detail,
  priceKey,
  itemLineField,
  dateField,
  partyLabel,
  showAmountPaid,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  detail: Record<string, unknown> | null | undefined;
  priceKey: 'unitCost' | 'unitPrice';
  itemLineField: string;
  dateField: string;
  partyLabel: string;
  showAmountPaid: boolean;
  onClose: () => void;
}) {
  const items = (detail?.items as unknown as DocLine[] | undefined) ?? [];
  return (
    <Modal open={open} onClose={onClose} title={`${detail?.number ?? ''}`} size="lg">
      {loading || !detail ? null : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Facts label="Date" value={new Date(String(detail[dateField])).toLocaleDateString('en-GB')} />
            <Facts label={partyLabel} value={kvName(detail.party ?? detail.customer ?? detail.supplier)} />
            <Facts label="Location" value={kvName(detail.stockLocation ?? detail.location)} />
            <Facts label="Status" value={String(detail.status)} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">{priceKey === 'unitCost' ? 'Unit Cost' : 'Unit Price'}</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const unit = priceKey === 'unitCost' ? it.unitCost : it.unitPrice;
                  const item = (it.item as Row | null) ?? ({} as Row);
                  return (
                    <tr key={String((item.code as string) ?? it.id ?? 'line')} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{String((item.name as string) ?? it.itemId ?? '—')} <span className="text-xs text-slate-400">({String((item.code as string) ?? '')})</span></td>
                      <td className="px-3 py-2 text-right text-slate-700">{it.quantity}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{money(unit, 'PKR')}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{money(it.quantity * unit, 'PKR')}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No lines.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <Fact label="Subtotal" value={money(detail.subtotal, 'PKR')} />
            <Fact label="Discount" value={`- ${money(detail.discount, 'PKR')}`} />
            <Fact label="Tax" value={money(detail.tax, 'PKR')} />
            {showAmountPaid && <Fact label="Amount paid" value={money(detail.amountPaid, 'PKR')} />}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-800">
              <span>Grand total</span><span>{money(detail.grandTotal, 'PKR')}</span>
            </div>
          </div>

          {!!detail.reference && <p className="mt-3 text-xs text-slate-500">Reference: {String(detail.reference)}</p>}
          {!!detail.note && <p className="mt-1 text-xs text-slate-500">Note: {String(detail.note)}</p>}
        </div>
      )}
    </Modal>
  );
}

function Facts({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-slate-600"><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}
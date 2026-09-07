'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, Plus, Printer, Search, XCircle } from 'lucide-react';
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
import { toast } from 'sonner';
import { printElement } from '@/lib/report-export';
import { PrintableDocument } from '@/components/tx/printable-document';
import type { Option } from '@/hooks/use-options';
import type { Paginated, TransactionDoc, DocLine } from '@/lib/types';

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
  const { options: itemOptions, data: itemData } = useItemOptions();
  const { post, cancel } = useDocumentMutations(resource, resource, { noun: config.newLabel?.toLowerCase() ?? 'document' });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<LineItem[]>([]);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [printRequested, setPrintRequested] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TransactionDoc | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const autoPrintRef = useRef(false);

  const { data, isLoading } = useQuery<Paginated<TransactionDoc>>({
    queryKey: [resource, page, search, status],
    queryFn: () => apiFetch(`/${resource}` + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<TransactionDoc | null>({
    queryKey: [resource, 'detail', detailId],
    queryFn: () => apiFetch(`/${resource}/${detailId}`),
    enabled: !!detailId,
  });

  const { data: nextNumber } = useQuery<string>({
    queryKey: [resource, 'next-number'],
    queryFn: () => apiFetch<{ number: string }>(`/${resource}/next-number`).then((r) => r.number),
    enabled: modalOpen,
    staleTime: 0,
  });

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch<TransactionDoc>(`/${resource}`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (record: TransactionDoc) => {
      qc.invalidateQueries({ queryKey: [resource] });
      qc.invalidateQueries({ queryKey: [resource, 'next-number'] });
      setModalOpen(false);
      setForm({});
      setLines([]);
      toast.success(`${config.newLabel ?? 'Document'} saved`);
      if (autoPrintRef.current) {
        autoPrintRef.current = false;
        setPrintRequested(true);
        setDetailId(record.id);
      }
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not save document');
    },
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
      discount: l.discount || 0,
      tax: l.tax || 0,
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

  const submitAndPrint = (e: React.FormEvent) => {
    autoPrintRef.current = true;
    submit(e);
  };

  const defaultPrice = (itemId: string): number | undefined => {
    const it = itemData.find((i) => i.id === itemId);
    if (!it) return undefined;
    const raw = priceKey === 'unitCost' ? it.purchasePrice : it.salePrice;
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : undefined;
  };

  const lineSubtotal = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  const lineDiscount = lines.reduce((s, l) => s + (l.discount || 0), 0);
  const lineTax = lines.reduce((s, l) => s + (l.tax || 0), 0);
  const grandTotal = useMemo(() => {
    const sub = lines.reduce((s, l) => s + l.quantity * l.price - (l.discount || 0) + (l.tax || 0), 0);
    return sub - Number(form.discount ?? 0) + Number(form.tax ?? 0);
  }, [lines, form.discount, form.tax]);

  const paid = Number(form.amountPaid ?? 0);
  const due = Math.max(0, grandTotal - paid);
  const paymentPreview = due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

  const partyField = partyParam;
  const canSubmit = lines.length > 0 && !!form[partyField] && !!form.stockLocationId;

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

        <DataTable<TransactionDoc>
          columns={[
            { key: 'number', header: 'Number', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.number}</span> },
            { key: dateField, header: 'Date', render: (r) => <span className="text-slate-600">{new Date(String(r[dateField])).toLocaleDateString('en-GB')}</span> },
            { key: 'party', header: partyLabel, render: (r) => {
              const party = r.supplier ?? r.customer;
              return <span className="text-slate-700">{party?.name ?? '-'}</span>;
            } },
            { key: 'grandTotal', header: 'Total', align: 'right', render: (r) => <span className="font-medium text-slate-800">{money(r.grandTotal, 'PKR')}</span> },
            ...(showAmountPaid ? [{ key: 'amountPaid', header: 'Paid', align: 'right' as const, render: (r: TransactionDoc) => <span className="text-slate-500">{money(r.amountPaid ?? 0, 'PKR')}</span> }] : []),
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'createdAt', header: 'Created', render: (r) => <span className="text-xs text-slate-400">{dateTime(r.createdAt)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setDetailId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View"><Eye className="h-4 w-4" /></button>
                  {r.status === 'draft' && (
                    <>
                      <button onClick={() => post.mutate(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700" title="Post"><CheckCircle2 className="h-4 w-4" /></button>
                      <button onClick={() => { setCancelTarget(r); setCancelReason(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Cancel"><XCircle className="h-4 w-4" /></button>
                    </>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`New ${title}`} size="xl">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-5">
              <Section label={`${partyLabel === 'Supplier' ? 'Purchase' : 'Sales'} Details`}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label={`${dateField === 'returnDate' ? 'Return' : title.replace(/s$/,'')} Date`} required>
                    <Input type="date" value={String(form[dateField] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [dateField]: e.target.value }))} required />
                  </Field>
                  <Field label={partyLabel === 'Supplier' ? 'Bill #' : 'Invoice #'}>
                    <Input value={nextNumber ?? ''} disabled className="font-mono" title="Auto-generated on save" />
                  </Field>
                  <Field label="Reference">
                    <Input value={String(form.reference ?? '')} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="party invoice #" />
                  </Field>
                </div>
              </Section>

              <Section label={partyLabel}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </Section>

              <Section label="Items">
                <ItemsEditor
                  items={lines}
                  onChange={setLines}
                  itemOptions={itemOptions}
                  priceKey={priceKey}
                  defaultPrice={defaultPrice}
                />
              </Section>

              <Section label="Note">
                <Textarea value={String(form.note ?? '')} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional notes printed on the document…" />
              </Section>
            </div>

            <div className="min-w-0">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Totals</p>
                <TotalsRow label="Subtotal" value={money(lineSubtotal, 'PKR')} />
                {lineDiscount > 0 && <TotalsRow label="Line discounts" value={`- ${money(lineDiscount, 'PKR')}`} />}
                {lineTax > 0 && <TotalsRow label="Line tax" value={money(lineTax, 'PKR')} />}

                <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                  <Field label="Discount"><Input type="number" min={0} step="0.01" value={String(form.discount ?? 0)} onChange={(e) => setForm((f) => ({ ...f, discount: Number(e.target.value) || 0 }))} /></Field>
                  <Field label="Tax"><Input type="number" min={0} step="0.01" value={String(form.tax ?? 0)} onChange={(e) => setForm((f) => ({ ...f, tax: Number(e.target.value) || 0 }))} /></Field>
                </div>

                <div className="flex items-center justify-between border-t-2 border-slate-800 pt-2.5">
                  <span className="text-sm font-semibold text-slate-800">Grand total</span>
                  <span className="text-lg font-bold tabular-nums text-slate-900">{money(grandTotal, 'PKR')}</span>
                </div>

                {showAmountPaid && (
                  <>
                    <div className="space-y-1.5 border-t border-slate-200 pt-3">
                      <Field label="Amount Paid">
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={String(paid || 0)}
                            onChange={(e) => setForm((f) => ({ ...f, amountPaid: Math.min(Number(e.target.value) || 0, grandTotal) }))}
                          />
                          <Button type="button" variant="secondary" size="md" onClick={() => setForm((f) => ({ ...f, amountPaid: grandTotal }))}>
                            Pay in full
                          </Button>
                        </div>
                      </Field>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Balance due</span>
                        <span className="tabular-nums font-semibold text-slate-800">{money(due, 'PKR')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="h-2 w-2 rounded-full" style={{ background: paymentPreview === 'paid' ? '#059669' : paymentPreview === 'partial' ? '#d97706' : '#dc2626' }} />
                        Payment will be <b className="uppercase text-slate-700">{paymentPreview}</b>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="button" variant="outline" onClick={submitAndPrint} disabled={!canSubmit} loading={create.isPending}>
              <Printer className="h-4 w-4" /> Save & Print
            </Button>
            <Button type="submit" disabled={!canSubmit} loading={create.isPending}>Create</Button>
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
        printRequested={printRequested}
        onPrintDone={() => setPrintRequested(false)}
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
        onConfirm={() => cancelTarget?.id && cancel.mutate({ id: cancelTarget.id, reason: cancelReason || 'Cancelled from UI' })}
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

function DocumentDetailModal({
  open,
  loading,
  detail,
  priceKey,
  itemLineField,
  dateField,
  partyLabel,
  showAmountPaid,
  printRequested,
  onPrintDone,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  detail: TransactionDoc | null | undefined;
  priceKey: 'unitCost' | 'unitPrice';
  itemLineField: string;
  dateField: string;
  partyLabel: string;
  showAmountPaid: boolean;
  printRequested?: boolean;
  onPrintDone?: () => void;
  onClose: () => void;
}) {
  const items = detail?.items ?? [];
  const [previewOpen, setPreviewOpen] = useState(false);
  const printTitle = partyLabel === 'Supplier' ? 'Purchase Bill' : 'Sales Invoice';
  const isCancelled = detail?.status === 'cancelled';

  useEffect(() => {
    if (printRequested && detail && !loading) {
      printElement('printable-document', printTitle, isCancelled ? 'CANCELLED' : undefined);
      onPrintDone?.();
    }
  }, [printRequested, detail, loading, printTitle, isCancelled, onPrintDone]);

  return (
    <>
      <PrintableDocument
        open={open}
        detail={detail}
        title={printTitle}
        partyLabel={partyLabel}
        dateField={dateField}
        priceKey={priceKey}
        showAmountPaid={showAmountPaid}
      />
      <Modal open={open} onClose={onClose} title={`${detail?.number ?? ''}`} size="lg">
        {loading || !detail ? null : (
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Facts label="Date" value={new Date(String(detail[dateField])).toLocaleDateString('en-GB')} />
                <Facts label={partyLabel} value={detail.supplier?.name ?? detail.customer?.name ?? '-'} />
                <Facts label="Location" value={detail.stockLocation?.name ?? detail.location?.name ?? '-'} />
                <Facts label="Status" value={detail.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="md" onClick={() => setPreviewOpen(true)}>
                  <Eye className="h-4 w-4" /> Preview
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => printElement('printable-document', printTitle, isCancelled ? 'CANCELLED' : undefined)}
                >
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  <button
                    onClick={() => printElement('printable-document', printTitle, isCancelled ? 'CANCELLED' : 'DUPLICATE')}
                    className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    title="Print duplicate copy"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => printElement('printable-document', printTitle, isCancelled ? 'CANCELLED' : 'TRIPLICATE')}
                    className="border-l border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    title="Print triplicate copy"
                  >
                    Triplicate
                  </button>
                </div>
              </div>
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
                  const unit = priceKey === 'unitCost' ? it.unitCost ?? 0 : it.unitPrice ?? 0;
                  return (
                    <tr key={it.id ?? it.itemId ?? 'line'} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{it.item?.name ?? it.itemId ?? '—'} <span className="text-xs text-slate-400">({it.item?.code ?? ''})</span></td>
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

          {!!detail.reference && <p className="mt-3 text-xs text-slate-500">Reference: {detail.reference}</p>}
          {!!detail.note && <p className="mt-1 text-xs text-slate-500">Note: {detail.note}</p>}
        </div>
      )}
      </Modal>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={`Print preview — ${detail?.number ?? ''}`} size="lg">
        <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-4" style={{ maxHeight: '75vh' }}>
          <div className="mx-auto w-[794px] origin-top scale-[0.72]">
            <PrintableDocument
              open={previewOpen}
              preview
              detail={detail}
              title={printTitle}
              partyLabel={partyLabel}
              dateField={dateField}
              priceKey={priceKey}
              showAmountPaid={showAmountPaid}
            />
          </div>
        </div>
      </Modal>
    </>
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
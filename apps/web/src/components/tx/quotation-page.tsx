'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Edit3, Eye, FileText, MessageCircle, Plus, Printer, Search, Send, ShieldX, Trash2 } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions, useItemOptions } from '@/hooks/use-options';
import { ItemsEditor, type LineItem } from '@/components/tx/items-editor';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { buildWhatsAppUrl, dateTime, money } from '@/lib/utils';
import { getCurrencyInfo } from '@/lib/currency';
import { toast } from 'sonner';
import { printElement } from '@/lib/report-export';
import { useAuth } from '@/context/auth-context';
import { PrintableDocument } from '@/components/tx/printable-document';
import type { Option } from '@/hooks/use-options';
import type { AuditEntry, Paginated, TransactionDoc } from '@/lib/types';

const RESOURCE = 'quotations';

/**
 * Quotations are price offers only: nothing here posts to stock or accounting.
 * The lifecycle is draft -> sent -> accepted / rejected, and an accepted
 * quotation can be turned into a draft sales invoice.
 */
export function QuotationPage({ customerOptions }: { customerOptions: Option[] }) {
  const qc = useQueryClient();
  const { options: itemOptions, data: itemData } = useItemOptions();
  const { can } = useAuth();

  const canCreate = can('sales.quotation.create');
  const canUpdate = can('sales.quotation.update');
  const canDelete = can('sales.quotation.delete');
  const canSend = can('sales.quotation.send');
  const canAccept = can('sales.quotation.accept');
  const canReject = can('sales.quotation.reject');
  const canConvert = can('sales.quotation.convert');
  const canPrint = can('sales.quotation.print');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<LineItem[]>([]);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [printRequested, setPrintRequested] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<TransactionDoc | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TransactionDoc | null>(null);
  const [convertTarget, setConvertTarget] = useState<TransactionDoc | null>(null);
  const [convertLocationId, setConvertLocationId] = useState('');
  const autoPrintRef = useRef(false);

  const { options: locationOptions } = useFlatOptions('stock-locations');

  const { data, isLoading } = useQuery<Paginated<TransactionDoc>>({
    queryKey: [RESOURCE, page, search, status],
    queryFn: () => apiFetch(`/${RESOURCE}` + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined })),
  });

  const { data: nextNumber } = useQuery<string>({
    queryKey: [RESOURCE, 'next-number'],
    queryFn: () => apiFetch<{ number: string }>(`/${RESOURCE}/next-number`).then((r) => r.number),
    enabled: modalOpen,
    staleTime: 0,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [RESOURCE] });
    qc.invalidateQueries({ queryKey: [RESOURCE, 'next-number'] });
  };

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch<TransactionDoc>(`/${RESOURCE}`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (record) => {
      refresh();
      setModalOpen(false);
      setEditId(null);
      setForm({});
      setLines([]);
      toast.success('Quotation saved');
      if (autoPrintRef.current) {
        autoPrintRef.current = false;
        setPrintRequested(true);
        setDetailId(record.id);
      }
    },
    onError: (e: Error) => { setError(e.message); toast.error(e.message || 'Could not save quotation'); },
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      apiFetch<TransactionDoc>(`/${RESOURCE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: (record) => {
      refresh();
      setModalOpen(false);
      setEditId(null);
      setForm({});
      setLines([]);
      toast.success('Quotation updated');
      if (autoPrintRef.current) {
        autoPrintRef.current = false;
        setPrintRequested(true);
        setDetailId(record.id);
      }
    },
    onError: (e: Error) => { setError(e.message); toast.error(e.message || 'Could not update quotation'); },
  });

  const statusAction = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'send' | 'accept' | 'reject'; reason?: string }) =>
      apiFetch<TransactionDoc>(`/${RESOURCE}/${id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? JSON.stringify({ reason }) : undefined,
      }),
    onSuccess: (_d, v) => {
      refresh();
      toast.success(`Quotation ${v.action === 'send' ? 'marked as sent' : v.action === 'accept' ? 'accepted' : 'rejected'}`);
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: ({ id, stockLocationId }: { id: string; stockLocationId?: string }) =>
      apiFetch<{ sale: TransactionDoc }>(`/${RESOURCE}/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ stockLocationId: stockLocationId || undefined }),
      }),
    onSuccess: (result) => {
      refresh();
      setConvertTarget(null);
      setConvertLocationId('');
      toast.success(`Sales invoice ${result.sale.number} created from the quotation`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/${RESOURCE}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); setDeleteTarget(null); toast.success('Quotation deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const buildPayload = () => ({
    quotationDate: form.quotationDate,
    validUntil: form.validUntil ? String(form.validUntil) : undefined,
    reference: form.reference,
    note: form.note,
    customerId: form.customerId,
    discount: Number(form.discount ?? 0),
    tax: Number(form.tax ?? 0),
    items: lines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      unitPrice: l.price,
      discount: l.discount || 0,
      tax: l.tax || 0,
    })),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.customerId) { setError('Select a customer.'); return; }
    if (lines.length === 0) { setError('Add at least one item line.'); return; }
    const payload = buildPayload();
    if (editId) update.mutate({ id: editId, payload });
    else create.mutate(payload);
  };

  const submitAndPrint = (e: React.FormEvent) => {
    autoPrintRef.current = true;
    handleSubmit(e);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ quotationDate: new Date().toISOString().slice(0, 10), validUntil: '', customerId: '' });
    setLines([]);
    setError('');
    setModalOpen(true);
  };

  const startEdit = (record: TransactionDoc) => {
    const lineItems: LineItem[] = (record.items ?? []).map((it) => ({
      key: `${it.id ?? it.itemId}-${Math.random().toString(36).slice(2, 7)}`,
      itemId: it.itemId,
      itemName: it.item?.name,
      quantity: it.quantity,
      price: it.unitPrice ?? 0,
      discount: it.discount ?? 0,
      tax: it.tax ?? 0,
    }));
    setForm({
      quotationDate: String(record.quotationDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
      validUntil: record.validUntil ? String(record.validUntil).slice(0, 10) : '',
      reference: record.reference ?? '',
      note: record.note ?? '',
      customerId: record.customerId ?? record.customer?.id ?? '',
      discount: record.discount ?? 0,
      tax: record.tax ?? 0,
    });
    setLines(lineItems);
    setEditId(record.id);
    setError('');
    setModalOpen(true);
  };

  const defaultPrice = (itemId: string): number | undefined => {
    const it = itemData.find((i) => i.id === itemId);
    if (!it) return undefined;
    const n = Number(it.salePrice ?? 0);
    return Number.isFinite(n) ? n : undefined;
  };

  const lineSubtotal = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  const lineDiscount = lines.reduce((s, l) => s + (l.discount || 0), 0);
  const lineTax = lines.reduce((s, l) => s + (l.tax || 0), 0);
  const grandTotal = useMemo(() => {
    const sub = lines.reduce((s, l) => s + l.quantity * l.price - (l.discount || 0) + (l.tax || 0), 0);
    return sub - Number(form.discount ?? 0) + Number(form.tax ?? 0);
  }, [lines, form.discount, form.tax]);

  const expired = (r: TransactionDoc) => {
    if (!r.validUntil) return false;
    if (r.status === 'accepted' || r.status === 'rejected') return false;
    return new Date(String(r.validUntil)) < new Date();
  };

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Price offers sent to customers. They do not move stock or affect the ledger until converted to an invoice."
        actions={canCreate ? <Button onClick={openNew}><Plus className="h-4 w-4" /> New Quotation</Button> : null}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search number / customer…" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>

        <DataTable<TransactionDoc>
          columns={[
            { key: 'number', header: 'Number', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.number}</span> },
            { key: 'quotationDate', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(String(r.quotationDate)).toLocaleDateString('en-GB')}</span> },
            { key: 'customer', header: 'Customer', render: (r) => <span className="text-slate-700">{r.customer?.name ?? '-'}</span> },
            {
              key: 'validUntil', header: 'Valid Until',
              render: (r) => {
                if (!r.validUntil) return <span className="text-slate-400">-</span>;
                const text = new Date(String(r.validUntil)).toLocaleDateString('en-GB');
                if (expired(r)) return <span className="font-medium text-red-600">{text} (expired)</span>;
                return <span className="text-slate-600">{text}</span>;
              },
            },
            { key: 'grandTotal', header: 'Amount', align: 'right', render: (r) => <span className="font-medium tabular-nums text-slate-800">{money(r.grandTotal ?? 0)}</span> },
            {
              key: 'whatsapp', header: 'WhatsApp',
              render: (r) => {
                const phone = r.customer?.phone;
                if (!phone) return <span className="text-xs text-slate-300">—</span>;
                const url = buildWhatsAppUrl(
                  phone,
                  `Assalam-o-Alaikum ${r.customer?.name ?? ''},\nOur quotation ${r.number ?? ''} of ${money(r.grandTotal ?? 0)}${r.validUntil ? ` is valid until ${new Date(String(r.validUntil)).toLocaleDateString('en-GB')}` : ''}.\nThank you!`,
                );
                if (!url) return <span className="text-xs text-slate-300">—</span>;
                return (
                  <a href={url} target="_blank" rel="noopener noreferrer" title="Share quotation on WhatsApp"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                    <MessageCircle className="h-3.5 w-3.5" /> {phone}
                  </a>
                );
              },
            },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => {
                const converted = !!(r as any).convertedSaleId || !!(r as any).convertedSale;
                return (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => setDetailId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View"><Eye className="h-4 w-4" /></button>
                    {canPrint && (
                      <button onClick={() => { setPrintRequested(true); setDetailId(r.id); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700" title="Print"><Printer className="h-4 w-4" /></button>
                    )}
                    {r.status === 'draft' && canSend && (
                      <button onClick={() => statusAction.mutate({ id: r.id, action: 'send' })} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" title="Mark as sent"><Send className="h-4 w-4" /></button>
                    )}
                    {r.status === 'sent' && canAccept && (
                      <button onClick={() => statusAction.mutate({ id: r.id, action: 'accept' })} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Mark as accepted"><CheckCircle2 className="h-4 w-4" /></button>
                    )}
                    {r.status === 'sent' && canReject && (
                      <button onClick={() => { setRejectTarget(r); setRejectReason(''); }} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-600" title="Mark as rejected"><ShieldX className="h-4 w-4" /></button>
                    )}
                    {r.status === 'accepted' && !converted && canConvert && (
                      <button onClick={() => { setConvertTarget(r); setConvertLocationId(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700" title="Convert to sales invoice"><FileText className="h-4 w-4" /></button>
                    )}
                    {!converted && canUpdate && (
                      <button onClick={() => startEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="Edit"><Edit3 className="h-4 w-4" /></button>
                    )}
                    {!converted && canDelete && (
                      <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                );
              },
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Quotation' : 'New Quotation'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-5">
              <Section label="Quotation Details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Quotation Date" required>
                    <Input type="date" value={String(form.quotationDate ?? '')} onChange={(e) => setForm((f) => ({ ...f, quotationDate: e.target.value }))} required />
                  </Field>
                  <Field label="Valid Until" hint="Leave blank to auto-set 30 days from the quotation date.">
                    <Input type="date" value={String(form.validUntil ?? '')} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} />
                  </Field>
                  <Field label="Quotation #">
                    <Input value={nextNumber ?? ''} disabled className="font-mono" title="Auto-generated on save" />
                  </Field>
                  <Field label="Reference">
                    <Input value={String(form.reference ?? '')} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="enquiry or PO number" />
                  </Field>
                  <Field label="Customer" required>
                    <Select value={String(form.customerId ?? '')} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} required>
                      <option value="">Select customer…</option>
                      {customerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </Field>
                </div>
              </Section>

              <Section label="Items">
                <ItemsEditor items={lines} onChange={setLines} itemOptions={itemOptions} priceKey="unitPrice" defaultPrice={defaultPrice} />
              </Section>

              <Section label="Note">
                <Textarea value={String(form.note ?? '')} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional notes printed on the quotation…" />
              </Section>
            </div>

            <div className="min-w-0">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Totals</p>
                <TotalsRow label="Subtotal" value={money(lineSubtotal)} />
                {lineDiscount > 0 && <TotalsRow label="Line discounts" value={`- ${money(lineDiscount)}`} />}
                {lineTax > 0 && <TotalsRow label="Line tax" value={money(lineTax)} />}

                <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
                  <Field label={`Discount (${getCurrencyInfo().symbol})`}><Input type="number" min={0} step="0.01" placeholder="Fixed amount" value={String(form.discount ?? 0)} onChange={(e) => setForm((f) => ({ ...f, discount: Number(e.target.value) || 0 }))} /></Field>
                  <Field label={`Tax (${getCurrencyInfo().symbol})`}><Input type="number" min={0} step="0.01" placeholder="Fixed amount" value={String(form.tax ?? 0)} onChange={(e) => setForm((f) => ({ ...f, tax: Number(e.target.value) || 0 }))} /></Field>
                </div>
                <p className="text-[11px] leading-snug text-slate-400">
                  Whole-quotation discount &amp; tax in {getCurrencyInfo().main.toLowerCase()} ({getCurrencyInfo().symbol}), not percentages — applied on top of the item lines.
                </p>

                <div className="flex items-center justify-between border-t-2 border-slate-800 pt-2.5">
                  <span className="text-sm font-semibold text-slate-800">Grand total</span>
                  <span className="text-lg font-bold tabular-nums text-slate-900">{money(grandTotal)}</span>
                </div>
              </div>

              {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="button" variant="outline" onClick={submitAndPrint}>Save &amp; Print</Button>
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  {editId ? 'Update Quotation' : 'Save Quotation'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <QuotationDetail
        open={!!detailId}
        detailId={detailId}
        canPrint={canPrint}
        printRequested={printRequested}
        onPrintDone={() => setPrintRequested(false)}
        onClose={() => setDetailId(null)}
      />

      <Modal open={!!convertTarget} onClose={() => setConvertTarget(null)} title="Convert to Sales Invoice" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            A draft invoice for <span className="font-semibold">{convertTarget?.number}</span> will be created with the same customer,
            items and totals. Stock and accounting only happen when that invoice is posted.
          </p>
          <Field label="Stock Location" hint="Leave on auto to use the first active location.">
            <Select value={convertLocationId} onChange={(e) => setConvertLocationId(e.target.value)}>
              <option value="">Auto</option>
              {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConvertTarget(null)}>Cancel</Button>
            <Button disabled={convert.isPending} onClick={() => convertTarget && convert.mutate({ id: convertTarget.id, stockLocationId: convertLocationId })}>
              Create Invoice
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!rejectTarget}
        danger
        title="Reject quotation"
        message={rejectTarget ? `Mark ${rejectTarget.number} as rejected. Optionally note why.` : ''}
        confirmLabel="Reject"
        loading={statusAction.isPending}
        onCancel={() => { setRejectTarget(null); setRejectReason(''); }}
        onConfirm={() => rejectTarget && statusAction.mutate({ id: rejectTarget.id, action: 'reject', reason: rejectReason || 'Rejected by customer' })}
      >
        <div className="mt-3">
          <Field label="Reason">
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Price too high, budget, etc…" />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete quotation"
        message={deleteTarget ? `${deleteTarget.number} will be permanently removed. This cannot be undone.` : ''}
        confirmLabel="Delete"
        loading={remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function QuotationDetail({
  open, detailId, canPrint, printRequested, onPrintDone, onClose,
}: {
  open: boolean;
  detailId: string | null;
  canPrint: boolean;
  printRequested?: boolean;
  onPrintDone?: () => void;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useQuery<TransactionDoc | null>({
    queryKey: [RESOURCE, 'detail', detailId],
    queryFn: () => apiFetch(`/${RESOURCE}/${detailId}`),
    enabled: !!detailId,
  });
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: activity } = useQuery<Paginated<AuditEntry>>({
    queryKey: ['audit-logs', 'entity', detail?.id],
    queryFn: () => apiFetch('/system/audit-logs' + qs({ page: 1, pageSize: 10, entityId: detail?.id })),
    enabled: !!open && !!detail?.id,
  });

  useEffect(() => {
    if (printRequested && detail && !isLoading) {
      printElement('printable-document', 'Quotation');
      onPrintDone?.();
    }
  }, [printRequested, detail, isLoading, onPrintDone]);

  if (!open) return null;
  const items = detail?.items ?? [];
  const validUntil = detail?.validUntil ? new Date(String(detail.validUntil)).toLocaleDateString('en-GB') : '';
  const convertedSale = (detail as any)?.convertedSale as { id: string; number: string; status: string } | null | undefined;
  const metaExtra = validUntil ? [{ label: 'Valid until', value: validUntil }] : [];

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Quotation ${detail?.number ?? ''}`} size="lg">
        {detail && (
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label="Customer" value={detail.customer?.name ?? '-'} />
              <Fact label="Date" value={new Date(String(detail.quotationDate)).toLocaleDateString('en-GB')} />
              <Fact label="Valid Until" value={validUntil || '-'} />
              <Fact label="Status" value={<StatusBadge status={detail.status} />} />
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
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
                  {items.map((it) => (
                    <tr key={it.id ?? it.itemId ?? 'line'} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{it.item?.name ?? it.itemId ?? '—'} <span className="text-xs text-slate-400">({it.item?.code ?? ''})</span></td>
                      <td className="px-3 py-2 text-right text-slate-700">{it.quantity}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{money(it.unitPrice ?? 0)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{money(it.quantity * (it.unitPrice ?? 0))}</td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No lines.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <FactRow label="Subtotal" value={money(detail.subtotal)} />
              <FactRow label="Discount" value={`- ${money(detail.discount)}`} />
              <FactRow label="Tax" value={money(detail.tax)} />
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-800">
                <span>Grand total</span><span>{money(detail.grandTotal)}</span>
              </div>
            </div>

            {!!detail.reference && <p className="mt-3 text-xs text-slate-500">Reference: {detail.reference}</p>}
            {!!detail.note && <p className="mt-1 text-xs text-slate-500">Note: {detail.note}</p>}
            {detail.status === 'sent' && <p className="mt-1 text-xs font-medium text-amber-600">Awaiting the customer's decision</p>}
            {detail.status === 'rejected' && !!(detail as any).decideReason && (
              <p className="mt-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs text-red-600">Rejected reason: {String((detail as any).decideReason)}</p>
            )}
            {convertedSale && (
              <p className="mt-2 rounded-lg border border-teal-100 bg-teal-50 px-2.5 py-1.5 text-xs text-teal-700">
                Converted to sales invoice <span className="font-semibold">{convertedSale.number}</span> ({convertedSale.status}).
              </p>
            )}

            {canPrint && (
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" size="md" onClick={() => setPreviewOpen(true)}>Print preview</Button>
                <Button size="md" onClick={() => printElement('printable-document', 'Quotation')}><Printer className="h-4 w-4" /> Print</Button>
              </div>
            )}

            {activity && activity.items.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Activity</div>
                <ol className="space-y-0 border-l border-slate-200">
                  {activity.items.map((ev) => (
                    <li key={ev.id} className="relative pb-3 pl-4">
                      <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-500" />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-xs font-semibold text-slate-700">{ev.user?.fullName ?? ev.user?.username ?? 'System'}</span>
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">{ev.action}</span>
                        <span className="text-[11px] text-slate-400">{dateTime(ev.createdAt)}</span>
                      </div>
                      {ev.message && <p className="mt-0.5 text-xs text-slate-500">{ev.message}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
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
              title="Quotation"
              partyLabel="Customer"
              dateField="quotationDate"
              priceKey="unitPrice"
              showAmountPaid={false}
              docType="quotation"
              metaExtra={metaExtra}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
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

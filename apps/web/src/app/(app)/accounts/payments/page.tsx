'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Eye, Landmark, Plus, RefreshCcw, Search, ShieldCheck, ShieldX, XCircle } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { createPayment, postPayment, cancelPayment, depositCheque, bounceCheque, endorseCheque, fetchOpenInvoices, fetchNextPaymentNumber } from '@/lib/accounts-api';
import type { PaymentPayload } from '@/lib/accounts-api';
import { useFlatOptions } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { dateTime, dateOnly, isDueSoon, isOverdue, money } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import type { Paginated, PaymentEntry, PaymentAllocation, OpenInvoice } from '@/lib/types';

interface AllocationLine {
  key: string;
  documentType: 'SALE' | 'PURCHASE';
  documentId: string;
  number: string;
  outstanding: number;
  allocated: number;
}

interface FlatAccount {
  id: string;
  code: string | null;
  name: string | null;
  subHead?: { name: string } | null;
}

export default function PaymentsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('accounts.payments.create');
  const canPost = can('accounts.payments.post');
  const canCancel = can('accounts.payments.cancel');
  const { options: accountOptions, data: accountsData } = useFlatOptions<FlatAccount>('main-accounts');
  const { options: customerOptions } = useFlatOptions('customers');
  const { options: supplierOptions } = useFlatOptions('suppliers');
  const { options: bankOptions, data: banks } = useFlatOptions('banks');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const [type, setType] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');
  const [partyType, setPartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [partyId, setPartyId] = useState('');
  const [mainAccountId, setMainAccountId] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CHEQUE' | 'BANK'>('CASH');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [pdcAccountId, setPdcAccountId] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [amount, setAmount] = useState(0);
  const [payDate, setPayDate] = useState('');
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [allocLines, setAllocLines] = useState<AllocationLine[]>([]);
  const [error, setError] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PaymentEntry | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading } = useQuery<Paginated<PaymentEntry>>({
    queryKey: ['payments', page, search, status, paymentType],
    queryFn: () => apiFetch('/payments' + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined, paymentType: paymentType || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<PaymentEntry | null>({
    queryKey: ['payment', detailId],
    queryFn: () => apiFetch(`/payments/${detailId}`),
    enabled: !!detailId,
  });

  const { data: nextNumber } = useQuery<string>({
    queryKey: ['payments', 'next-number', type],
    queryFn: () => fetchNextPaymentNumber(type),
    enabled: modalOpen,
    staleTime: 0,
  });

  const allocatedTotal = useMemo(() => allocLines.reduce((s, l) => s + l.allocated, 0), [allocLines]);

  const unallocated = Math.max(0, Number(amount || 0) - allocatedTotal);

  const { data: openInvoices, isLoading: invoicesLoading } = useQuery<OpenInvoice[]>({
    queryKey: ['payments', 'open-invoices', partyType, partyId],
    queryFn: () => fetchOpenInvoices(partyType, partyId),
    enabled: modalOpen && !!partyId,
  });

  useEffect(() => {
    setAllocLines((prev) => {
      const currentKeys = new Set(prev.map((l) => l.documentId));
      const invoices = openInvoices ?? [];
      const retained = prev.filter((l) => invoices.some((i) => i.documentId === l.documentId));
      const added = invoices
        .filter((i) => !currentKeys.has(i.documentId))
        .map((i) => ({
          key: `${i.documentId}-${Math.random().toString(36).slice(2, 7)}`,
          documentType: i.documentType,
          documentId: i.documentId,
          number: i.number,
          outstanding: i.outstanding,
          allocated: 0,
        }));
      return [...retained, ...added];
    });
  }, [openInvoices]);

  const resetForm = () => {
    setType('RECEIPT');
    setPartyType('CUSTOMER');
    setPartyId('');
    setMainAccountId('');
    setMethod('CASH');
    setChequeNumber('');
    setBankAccountId('');
    setPdcAccountId('');
    setChequeDate('');
    setAmount(0);
    setPayDate(new Date().toISOString().slice(0, 10));
    setReference('');
    setNarration('');
    setAllocLines([]);
    setError('');
  };

  const create = useMutation({
    mutationFn: (payload: PaymentPayload) => createPayment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments', 'next-number'] });
      setModalOpen(false);
      resetForm();
      toast.success('Receipt / payment saved for approval');
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not save payment entry');
    },
  });

  const post = useMutation({
    mutationFn: (id: string) => postPayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment entry approved');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not approve payment entry'),
  });

  const cancelEntry = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelPayment(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      setCancelTarget(null);
      toast.success('Payment entry cancelled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not cancel payment entry'),
  });

  const deposit = useMutation({
    mutationFn: (id: string) => depositCheque(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['cheques'] });
      toast.success('Cheque cleared into bank');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not clear cheque'),
  });

  const bounceTarget = useState<PaymentEntry | null>(null);
  const [bounceEntry, setBounceEntry] = bounceTarget;
  const [bounceReason, setBounceReason] = useState('');

  const [endorseEntry, setEndorseEntry] = useState<PaymentEntry | null>(null);
  const [endorsePartyType, setEndorsePartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('SUPPLIER');
  const [endorsePartyId, setEndorsePartyId] = useState('');

  const endorse = useMutation({
    mutationFn: ({ id, partyType, partyId }: { id: string; partyType: 'CUSTOMER' | 'SUPPLIER'; partyId: string }) =>
      endorseCheque(id, partyType, partyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['cheques'] });
      setEndorseEntry(null);
      setEndorsePartyId('');
      toast.success('Cheque endorsed to party');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not endorse cheque'),
  });

  const bounce = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bounceCheque(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['cheques'] });
      setBounceEntry(null);
      setBounceReason('');
      toast.success('Cheque marked as bounced');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not mark cheque as bounced'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const amt = Number(amount || 0);
    if (amt <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    const pdcMode = method === 'CHEQUE' && !!chequeDate;
    if (!partyId) {
      setError('Select the party.');
      return;
    }
    if (!pdcMode && !mainAccountId) {
      setError('Select the cash / bank account.');
      return;
    }
    if (method === 'CHEQUE' && !chequeNumber.trim()) {
      setError('Enter the cheque number.');
      return;
    }
    if (method === 'CHEQUE' && (!pdcMode || type === 'PAYMENT') && !bankAccountId) {
      setError('Select the bank account for the cheque.');
      return;
    }
    if (allocatedTotal > amt) {
      setError(`Allocated amount (${money(allocatedTotal, 'PKR')}) exceeds the payment amount.`);
      return;
    }
    create.mutate({
      paymentType: type,
      partyType,
      partyId,
      mainAccountId: pdcMode ? (type === 'RECEIPT' ? (pdcAccountId || undefined) : undefined) : mainAccountId,
      method,
      chequeNumber: method === 'CHEQUE' ? chequeNumber.trim() : undefined,
      bankAccountId: method === 'CHEQUE' ? (pdcMode && type === 'RECEIPT' ? (bankAccountId || undefined) : bankAccountId) : undefined,
      pdcAccountId: method === 'CHEQUE' && pdcMode && type === 'RECEIPT' ? (pdcAccountId || undefined) : undefined,
      chequeDate: method === 'CHEQUE' && chequeDate ? chequeDate : undefined,
      amount: amt,
      paymentDate: payDate,
      reference: reference || undefined,
      narration: narration || undefined,
      allocations: allocLines
        .filter((l) => l.allocated > 0)
        .map((l) => ({ documentType: l.documentType, documentId: l.documentId, allocatedAmount: l.allocated })),
    });
  };

  const toggleAllocate = (line: AllocationLine) => {
    setAllocLines((ls) =>
      ls.map((l) =>
        l.documentId === line.documentId
          ? { ...l, allocated: l.allocated > 0 ? 0 : Math.min(l.outstanding, Number(amount || 0) - (allocatedTotal - l.allocated)) }
          : l,
      ),
    );
  };

  const allocateAll = () => {
    const amt = Number(amount || 0);
    let rest = amt;
    setAllocLines((ls) =>
      ls.map((l) => {
        const take = Math.min(l.outstanding, rest > 0 ? rest : 0);
        rest = Math.max(0, rest - take);
        return { ...l, allocated: take };
      }),
    );
  };

  const setLineAllocation = (line: AllocationLine, value: number) => {
    setAllocLines((ls) =>
      ls.map((l) =>
        l.documentId === line.documentId
          ? { ...l, allocated: Math.min(Math.max(0, value), l.outstanding, Number(amount || 0)) }
          : l,
      ),
    );
  };

  const partyOptions = partyType === 'CUSTOMER' ? customerOptions : supplierOptions;

  const pdcOptions = (accountsData ?? [])
    .filter((a) => a.subHead?.name === 'PDCS')
    .map((a) => ({ value: a.id, label: [a.code, a.name].filter(Boolean).join(' · ') }));
  const pdcMode = method === 'CHEQUE' && !!chequeDate;
  const endorsePartyOptions = endorsePartyType === 'CUSTOMER' ? customerOptions : supplierOptions;

  const renderDueDate = (dueDate?: string, paid = false) => {
    if (paid) return <span className="text-emerald-600">Cleared</span>;
    if (!dueDate) return <span className="text-slate-400">-</span>;
    if (isOverdue(dueDate)) return <span className="font-medium text-red-600">{dateOnly(dueDate)}</span>;
    if (isDueSoon(dueDate)) return <span className="font-medium text-amber-600">{dateOnly(dueDate)}</span>;
    return <span className="text-slate-600">{dateOnly(dueDate)}</span>;
  };

  return (
    <div>
      <PageHeader
        title="Receipts & Payments"
        description="Record money received from customers or paid to suppliers, allocated against open invoices."
        actions={
          canCreate ? (
            <Button onClick={() => { resetForm(); setModalOpen(true); }}>
              <Plus className="h-4 w-4" /> New Receipt / Payment
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search number / party…" className="pl-9" />
          </div>
          <Select value={paymentType} onChange={(e) => { setPaymentType(e.target.value); setPage(1); }} className="w-40">
            <option value="">All types</option>
            <option value="RECEIPT">Receipts</option>
            <option value="PAYMENT">Payments</option>
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All status</option>
            <option value="pending">Pending approval</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <DataTable<PaymentEntry>
          columns={[
            { key: 'number', header: 'Number', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.number}</span> },
            { key: 'paymentDate', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(r.paymentDate).toLocaleDateString('en-GB')}</span> },
            { key: 'party', header: 'Party', render: (r) => <span className="text-slate-700">{r.partyName ?? '-'}</span> },
            {
              key: 'paymentType', header: 'Type',
              render: (r) => (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${r.paymentType === 'RECEIPT' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {r.paymentType === 'RECEIPT' ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                  {r.paymentType === 'RECEIPT' ? 'Receipt' : 'Payment'}
                </span>
              ),
            },
            { key: 'method', header: 'Method', render: (r) => <span className="text-slate-500">{r.method}</span> },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-medium text-slate-800">{money(r.amount, 'PKR')}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'createdAt', header: 'Created', render: (r) => <span className="text-xs text-slate-400">{dateTime(r.createdAt)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setDetailId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View"><Eye className="h-4 w-4" /></button>
                  {r.status === 'pending' && (
                    <>
                      {canPost && (
                        <button onClick={() => post.mutate(r.id)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50 hover:text-teal-700" title="Approve">
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      )}
                      {canCancel && (
                        <button onClick={() => { setCancelTarget(r); setCancelReason(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Cancel"><XCircle className="h-4 w-4" /></button>
                      )}
                    </>
                  )}
                  {r.status === 'posted' && r.method === 'CHEQUE' && r.chequeStatus === 'IN_HAND' && canPost && (
                    <>
                      <button onClick={() => deposit.mutate(r.id)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700" title="Clear cheque into bank">
                        <Landmark className="h-4 w-4" />
                      </button>
                      {r.paymentType === 'RECEIPT' && (
                        <button onClick={() => { setEndorseEntry(r); setEndorsePartyType(r.paymentType === 'RECEIPT' ? 'SUPPLIER' : 'CUSTOMER'); setEndorsePartyId(''); }} className="rounded-lg p-1.5 text-violet-600 hover:bg-violet-50 hover:text-violet-700" title="Endorse cheque to party">
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => { setBounceEntry(r); setBounceReason(''); }} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-600" title="Mark as bounced">
                        <RefreshCcw className="h-4 w-4" />
                      </button>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Receipt / Payment" size="xl">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Type" required>
              <Select value={type} onChange={(e) => {
                const t = e.target.value as 'RECEIPT' | 'PAYMENT';
                setType(t);
                setPartyType(t === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER');
                setPartyId('');
                setAllocLines([]);
              }}>
                <option value="RECEIPT">Receipt — money in</option>
                <option value="PAYMENT">Payment — money out</option>
              </Select>
            </Field>
            <Field label="Number">
              <Input value={nextNumber ?? ''} disabled className="font-mono" title="Auto-generated on save" />
            </Field>
            <Field label="Party type" required>
              <Select value={partyType} onChange={(e) => { setPartyType(e.target.value as 'CUSTOMER' | 'SUPPLIER'); setPartyId(''); setAllocLines([]); }}>
                <option value="CUSTOMER">Customer</option>
                <option value="SUPPLIER">Supplier</option>
              </Select>
            </Field>
            <Field label={partyType === 'CUSTOMER' ? 'Customer' : 'Supplier'} required>
              <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                <option value="">Select {partyType === 'CUSTOMER' ? 'customer' : 'supplier'}…</option>
                {partyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            {!pdcMode && (
              <Field label="Cash / Bank account" required>
                <Select value={mainAccountId} onChange={(e) => setMainAccountId(e.target.value)} required>
                  <option value="">Select account…</option>
                  {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Method" required>
              <Select value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'CHEQUE' | 'BANK')}>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="BANK">Bank transfer</option>
              </Select>
            </Field>
            {method === 'CHEQUE' && (
              <>
                <Field label="Cheque number" required>
                  <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="e.g. 00421579" required />
                </Field>
                <Field label="Cheque date (post-dated?)">
                  <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </Field>
                {pdcMode && type === 'RECEIPT' ? (
                  <>
                    <Field label="PDC account (receiving)">
                      <Select value={pdcAccountId} onChange={(e) => setPdcAccountId(e.target.value)}>
                        <option value="">Auto-create / use party’s PDC account…</option>
                        {pdcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Bank account (for clearing later)">
                      <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                        <option value="">Optional…</option>
                        {bankOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                  </>
                ) : (
                  <Field label="Bank account" required>
                    <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
                      <option value="">Select bank…</option>
                      {bankOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </Field>
                )}
              </>
            )}
            {pdcMode && (
              type === 'RECEIPT' ? (
                <p className="text-xs text-slate-400">
                  Post-dated cheque receipt is booked as <span className="font-medium">Dr PDC account / Cr party</span>.
                  A PDC MGC-type account (under the PDCS sub-head) is created per party on save.
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Post-dated cheque issue is booked as <span className="font-medium">Dr {partyType === 'SUPPLIER' ? 'supplier' : 'party'} / Cr Cheques Issued</span>.
                  Once the payee presents it and it clears, the bank is debited from the Cheques Register.
                </p>
              )
            )}
            <Field label="Date" required>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
            </Field>
            <Field label="Reference">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" />
            </Field>
            <Field label="Amount (₨)" required>
              <Input type="number" min={0} step="0.01" value={amount ? String(amount) : ''} onChange={(e) => { setAmount(Number(e.target.value) || 0); }} placeholder="0" required />
            </Field>
          </div>

          {!!partyId && (
            <div className="rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Allocate against open {partyType === 'CUSTOMER' ? 'invoices' : 'bills'}
                  <span className="ml-2 font-normal normal-case text-slate-500">
                    Allocated {money(allocatedTotal, 'PKR')} of {money(Number(amount || 0), 'PKR')}
                    {unallocated > 0 && ` — unallocated ${money(unallocated, 'PKR')}`}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" disabled={Number(amount || 0) <= 0} onClick={allocateAll}>
                    Allocate all
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAllocLines((ls) => ls.map((l) => ({ ...l, allocated: 0 })))}>
                    Clear
                  </Button>
                </div>
              </div>
              {invoicesLoading ? (
                <p className="px-4 py-4 text-sm text-slate-400">Loading open invoices…</p>
              ) : openInvoices && openInvoices.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2">Document</th>
                      <th className="px-3 py-2">Due</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="w-32 px-3 py-2 text-right">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openInvoices.map((inv) => {
                      const line = allocLines.find((l) => l.documentId === inv.documentId);
                      const checked = (line?.allocated ?? 0) > 0;
                      return (
                        <tr key={inv.documentId} className="border-b border-slate-100 last:border-0" onClick={() => line && toggleAllocate(line)}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={checked} readOnly className="h-4 w-4 accent-teal-600" />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">{inv.number}</td>
                          <td className="px-3 py-2">{renderDueDate(inv.dueDate)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{money(inv.total, 'PKR')}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{money(inv.paid, 'PKR')}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">{money(inv.outstanding, 'PKR')}</td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number" min={0} step="0.01"
                              className="text-right"
                              value={line?.allocated ? String(line.allocated) : ''}
                              placeholder="0"
                              disabled={!line}
                              onClick={(ev) => ev.stopPropagation()}
                              onChange={(ev) => line && setLineAllocation(line, Number(ev.target.value) || 0)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-4 text-sm text-slate-400">No open {partyType === 'CUSTOMER' ? 'invoices' : 'bills'} — this entry will be unallocated.</p>
              )}
            </div>
          )}

          <Field label="Narration">
            <Textarea value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Optional note printed on the voucher…" />
          </Field>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Save for approval</Button>
          </div>
        </form>
      </Modal>

      <PaymentDetailModal open={!!detailId} loading={detailLoading} detail={detail} onClose={() => setDetailId(null)} />

      <ConfirmDialog
        open={!!cancelTarget}
        danger
        title="Cancel payment entry"
        message="Only pending entries can be cancelled. Posted payments need a reversing entry instead."
        confirmLabel="Cancel entry"
        loading={cancelEntry.isPending}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget?.id && cancelEntry.mutate({ id: cancelTarget.id, reason: cancelReason || 'Cancelled from UI' })}
      >
        <div className="mt-3">
          <Field label="Reason">
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Optional reason" />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!bounceEntry}
        danger
        title="Mark cheque as bounced"
        message={`This reverses the cheque (${bounceEntry?.number ?? ''}) back to ${bounceEntry?.partyName ?? 'the party'} and re-opens the allocated documents.`}
        confirmLabel="Mark bounced"
        loading={bounce.isPending}
        onCancel={() => setBounceEntry(null)}
        onConfirm={() => bounceEntry?.id && bounce.mutate({ id: bounceEntry.id, reason: bounceReason || 'Bounced (insufficient funds)' })}
      >
        <div className="mt-3">
          <Field label="Bounce reason" required>
            <Textarea value={bounceReason} onChange={(e) => setBounceReason(e.target.value)} placeholder="e.g. insufficient funds" />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!endorseEntry}
        title="Endorse cheque to another party"
        message={`This pays the cheque (${endorseEntry?.number ?? ''} · ${endorseEntry?.amount ? money(endorseEntry.amount, 'PKR') : ''}) out of the PDC account — Dr party / Cr PDC account.`}
        confirmLabel="Endorse cheque"
        loading={endorse.isPending}
        onCancel={() => { setEndorseEntry(null); setEndorsePartyId(''); }}
        onConfirm={() => endorseEntry?.id && endorsePartyId && endorse.mutate({ id: endorseEntry.id, partyType: endorsePartyType, partyId: endorsePartyId })}
      >
        <div className="mt-3 grid grid-cols-1 gap-3">
          <Field label="Endorse to" required>
            <Select value={endorsePartyType} onChange={(e) => { setEndorsePartyType(e.target.value as 'CUSTOMER' | 'SUPPLIER'); setEndorsePartyId(''); }}>
              <option value="SUPPLIER">Supplier (payable)</option>
              <option value="CUSTOMER">Customer</option>
            </Select>
          </Field>
          <Field label={endorsePartyType === 'CUSTOMER' ? 'Customer' : 'Supplier'} required>
            <Select value={endorsePartyId} onChange={(e) => setEndorsePartyId(e.target.value)} required>
              <option value="">Select {endorsePartyType === 'CUSTOMER' ? 'customer' : 'supplier'}…</option>
              {endorsePartyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function PaymentDetailModal({
  open,
  loading,
  detail,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  detail: PaymentEntry | null | undefined;
  onClose: () => void;
}) {
  const allocations: PaymentAllocation[] = detail?.allocations ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`${detail?.number ?? ''}`} size="lg">
      {loading || !detail ? null : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <KV label="Type" value={`${detail.paymentType} (${detail.partyType})`} />
            <KV label="Party" value={detail.partyName ?? '-'} />
            <KV label="Date" value={new Date(detail.paymentDate).toLocaleDateString('en-GB')} />
            <KV label="Account" value={detail.mainAccount?.name ?? '-'} />
            <KV label="Method" value={detail.method + (detail.chequeNumber ? ` · ${detail.chequeNumber}` : '')} />
            <KV label="Status" value={detail.status.toUpperCase()} />
            {detail.bankAccount && <KV label="Bank" value={`${detail.bankAccount.name}${detail.bankAccount.accountNumber ? ` · ${detail.bankAccount.accountNumber}` : ''}`} />}
            {detail.pdcAccount && <KV label="PDC account" value={detail.pdcAccount.name} />}
            {detail.chequeDate && <KV label="Cheque date" value={dateOnly(detail.chequeDate)} />}
            {detail.chequeStatus && <KV label="Cheque status" value={detail.chequeStatus} />}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-semibold text-slate-700">Amount</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{money(detail.amount, 'PKR')}</span>
          </div>

          {allocations.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Document</th>
                    <th className="px-3 py-2 text-right">Allocated</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-700">{a.documentType} — {a.documentId}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{money(a.allocatedAmount, 'PKR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!!detail.reference && <p className="mt-3 text-xs text-slate-500">Reference: {detail.reference}</p>}
          {!!detail.narration && <p className="mt-1 text-xs text-slate-500">Narration: {detail.narration}</p>}
          {detail.status === 'cancelled' && !!detail.cancelReason && (
            <p className="mt-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs text-red-600">Cancel reason: {detail.cancelReason}</p>
          )}
          {detail.chequeStatus === 'BOUNCED' && !!detail.bounceReason && (
            <p className="mt-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs text-red-600">Bounce reason: {detail.bounceReason}</p>
          )}
        </div>
      )}
    </Modal>
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
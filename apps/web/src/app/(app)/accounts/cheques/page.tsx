'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeftRight, ArrowDownCircle, ArrowUpCircle, Eye, Landmark, Pencil, RefreshCcw, Search } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { depositCheque, bounceCheque, endorseCheque, editCheque, type EditChequePayload } from '@/lib/accounts-api';
import { Button } from '@/components/ui/button';
import { Input, Select, Field, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { dateTime, dateOnly, money } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { useFlatOptions } from '@/hooks/use-options';
import type { Paginated, PaymentEntry } from '@/lib/types';

interface FlatAccount {
  id: string;
  code: string | null;
  name: string | null;
  subHead?: { name: string } | null;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All cheque states' },
  { value: 'PENDING', label: 'Pending approval' },
  { value: 'IN_HAND', label: 'In hand' },
  { value: 'CLEARED', label: 'Cleared' },
  { value: 'DEPOSITED', label: 'Deposited' },
  { value: 'ENDORSED', label: 'Endorsed to party' },
  { value: 'BOUNCED', label: 'Bounced' },
];

const STATUS_BADGES: Record<string, { className: string; label: string }> = {
  PENDING: { className: 'bg-amber-50 text-amber-700', label: 'Pending approval' },
  IN_HAND: { className: 'bg-blue-50 text-blue-700', label: 'In hand' },
  CLEARED: { className: 'bg-emerald-50 text-emerald-700', label: 'Cleared' },
  DEPOSITED: { className: 'bg-teal-50 text-teal-700', label: 'Deposited' },
  ENDORSED: { className: 'bg-violet-50 text-violet-700', label: 'Endorsed' },
  BOUNCED: { className: 'bg-red-50 text-red-700', label: 'Bounced' },
};

export default function ChequesRegisterPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canPost = can('accounts.payments.post');
  const canUpdate = can('accounts.payments.update');

  const [search, setSearch] = useState('');
  const [chequeStatus, setChequeStatus] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bounceEntry, setBounceEntry] = useState<PaymentEntry | null>(null);
  const [bounceReason, setBounceReason] = useState('');

  const [endorseEntry, setEndorseEntry] = useState<PaymentEntry | null>(null);
  const [endorsePartyType, setEndorsePartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('SUPPLIER');
  const [endorsePartyId, setEndorsePartyId] = useState('');

  const [editEntry, setEditEntry] = useState<PaymentEntry | null>(null);
  const [editForm, setEditForm] = useState<EditChequePayload>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const { options: customerOptions } = useFlatOptions('customers');
  const { options: supplierOptions } = useFlatOptions('suppliers');
  const { options: bankOptions } = useFlatOptions('banks');
  const { options: accountOptions, data: accountsData } = useFlatOptions<FlatAccount>('main-accounts');

  const editPartyOptions = editForm.partyType === 'CUSTOMER' ? customerOptions : supplierOptions;
  // PDC treatment is locked for posted entries (only a pending cheque can be flipped).
  const editPdcFlipLocked = !!editEntry && editEntry.status !== 'pending';
  const editIsPdc = editPdcFlipLocked ? !!editEntry?.chequeDate : !!editForm.chequeDate;
  const editPdcOptions = (accountsData ?? [])
    .filter((a) => a.subHead?.name === 'PDCS')
    .map((a) => ({ value: a.id, label: [a.code, a.name].filter(Boolean).join(' · ') }));

  const { data, isLoading } = useQuery<Paginated<PaymentEntry>>({
    queryKey: ['cheques', page, search, chequeStatus, paymentType],
    queryFn: () =>
      apiFetch(
        '/payments' +
          qs({
            page,
            pageSize: 20,
            method: 'CHEQUE',
            search: search || undefined,
            chequeStatus: chequeStatus || undefined,
            paymentType: paymentType || undefined,
          }),
      ),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<PaymentEntry | null>({
    queryKey: ['payment', detailId],
    queryFn: () => apiFetch(`/payments/${detailId}`),
    enabled: !!detailId,
  });

  const deposit = useMutation({
    mutationFn: (id: string) => depositCheque(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cheques'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Cheque cleared into bank');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not clear cheque'),
  });

  const bounce = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bounceCheque(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cheques'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setBounceEntry(null);
      setBounceReason('');
      toast.success('Cheque marked as bounced');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not mark cheque as bounced'),
  });

  const endorse = useMutation({
    mutationFn: ({ id, partyType, partyId }: { id: string; partyType: 'CUSTOMER' | 'SUPPLIER'; partyId: string }) =>
      endorseCheque(id, partyType, partyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cheques'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setEndorseEntry(null);
      setEndorsePartyId('');
      toast.success('Cheque endorsed to party');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not endorse cheque'),
  });

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;
    setEditSaving(true);
    setEditError('');
    try {
      const payload: EditChequePayload = {};
      const originalChequeDate = toDateInput(editEntry.chequeDate);
      const formChequeDate = editForm.chequeDate ?? '';
      if (editForm.chequeNumber?.trim()) payload.chequeNumber = editForm.chequeNumber.trim();
      if (formChequeDate !== originalChequeDate) payload.chequeDate = formChequeDate || '';
      if (!editBankLocked && editForm.bankAccountId) payload.bankAccountId = editForm.bankAccountId;
      if (editForm.paymentDate) payload.paymentDate = editForm.paymentDate;
      if (editForm.amount !== undefined) payload.amount = editForm.amount;
      if (editForm.partyId && editForm.partyType) {
        if (editForm.partyId !== editEntry.partyId || editForm.partyType !== editEntry.partyType) {
          payload.partyType = editForm.partyType;
          payload.partyId = editForm.partyId;
        }
      }
      if (editIsPdc) {
        if (!editBankLocked && editForm.pdcAccountId) payload.pdcAccountId = editForm.pdcAccountId;
      } else if (!editBankLocked && editForm.mainAccountId) {
        payload.mainAccountId = editForm.mainAccountId;
      }
      payload.reference = editForm.reference ?? '';
      payload.narration = editForm.narration ?? '';
      await editCheque(editEntry.id, payload);
      qc.invalidateQueries({ queryKey: ['cheques'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setEditEntry(null);
      setEditForm({});
      toast.success('Cheque details updated');
    } catch (err) {
      setEditError((err as Error).message || 'Could not update cheque');
    } finally {
      setEditSaving(false);
    }
  };

  const isDueToday = (date?: string | null) => {
    if (!date) return false;
    const today = new Date().toISOString().slice(0, 10);
    return new Date(date).toISOString().slice(0, 10) === today;
  };

  const toDateInput = (value?: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : '');

  const openEdit = (r: PaymentEntry) => {
    setEditForm({
      chequeNumber: r.chequeNumber ?? '',
      bankAccountId: r.bankAccountId ?? '',
      pdcAccountId: r.pdcAccountId ?? '',
      mainAccountId: r.mainAccountId ?? '',
      partyType: r.partyType,
      partyId: r.partyId ?? '',
      chequeDate: toDateInput(r.chequeDate),
      paymentDate: toDateInput(r.paymentDate),
      amount: r.amount,
      reference: r.reference ?? '',
      narration: r.narration ?? '',
    });
    setEditError('');
    setEditEntry(r);
  };

  const editBankLocked = !!editEntry && (editEntry.chequeStatus === 'DEPOSITED' || editEntry.chequeStatus === 'CLEARED');

  const endorsePartyOptions = endorsePartyType === 'CUSTOMER' ? customerOptions : supplierOptions;

  return (
    <div>
      <PageHeader
        title="Cheques Register"
        description="Track post-dated and regular cheques received and issued — clear them into the bank or mark them bounced."
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search number / party / cheque…" className="pl-9" />
          </div>
          <Select value={paymentType} onChange={(e) => { setPaymentType(e.target.value); setPage(1); }} className="w-40">
            <option value="">All cheque types</option>
            <option value="RECEIPT">Received</option>
            <option value="PAYMENT">Issued</option>
          </Select>
          <Select value={chequeStatus} onChange={(e) => { setChequeStatus(e.target.value); setPage(1); }} className="w-44">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        <DataTable<PaymentEntry>
          columns={[
            { key: 'number', header: 'Entry', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.number}</span> },
            {
              key: 'paymentType', header: 'Direction',
              render: (r) => (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${r.paymentType === 'RECEIPT' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {r.paymentType === 'RECEIPT' ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                  {r.paymentType === 'RECEIPT' ? 'Received' : 'Issued'}
                </span>
              ),
            },
            { key: 'paymentDate', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(r.paymentDate).toLocaleDateString('en-GB')}</span> },
            { key: 'party', header: 'Party', render: (r) => <span className="text-slate-700">{r.partyName ?? '-'}</span> },
            { key: 'chequeNumber', header: 'Cheque no.', render: (r) => <span className="font-mono text-slate-600">{r.chequeNumber ?? '-'}</span> },
            { key: 'chequeDate', header: 'Cheque date', render: (r) => (
              <span className="text-slate-600">
                {r.chequeDate ? dateOnly(r.chequeDate) : '-'}
                {r.chequeStatus === 'IN_HAND' && isDueToday(r.chequeDate) && (
                  <span className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">due today</span>
                )}
              </span>
            ) },
            { key: 'pdcAccount', header: 'PDC account', render: (r) => <span className="text-slate-600">{r.pdcAccount?.name ?? (r.paymentType === 'PAYMENT' ? (r.mainAccount?.name ?? 'Cheques Issued') : '-')}</span> },
            { key: 'bankAccount', header: 'Bank', render: (r) => <span className="text-slate-600">{r.bankAccount?.name ?? '-'}</span> },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-medium text-slate-800">{money(r.amount, 'PKR')}</span> },
            {
              key: 'chequeStatus', header: 'State',
              render: (r) => {
                const badge = STATUS_BADGES[r.chequeStatus ?? ''] ?? STATUS_BADGES.PENDING;
                return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>;
              },
            },
            { key: 'entryStatus', header: 'Entry', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setDetailId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View"><Eye className="h-4 w-4" /></button>
                  {canUpdate && r.status !== 'cancelled' && r.chequeStatus !== 'BOUNCED' && r.chequeStatus !== 'ENDORSED' && (
                    <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 hover:text-amber-700" title="Edit cheque details">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {r.status === 'posted' && r.chequeStatus === 'IN_HAND' && canPost && (
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

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail?.number ?? ''} size="lg">
        {detailLoading || !detail ? null : (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <KV label="Party" value={detail.partyName ?? '-'} />
            <KV label="Direction" value={detail.paymentType === 'RECEIPT' ? 'Received' : 'Issued'} />
            <KV label="Date" value={new Date(detail.paymentDate).toLocaleDateString('en-GB')} />
            <KV label="Cheque no." value={detail.chequeNumber ?? '-'} />
            <KV label="Cheque date" value={detail.chequeDate ? dateOnly(detail.chequeDate) : '-'} />
            <KV label="Bank" value={detail.bankAccount?.name ?? '-'} />
            <KV label="PDC account" value={detail.pdcAccount?.name ?? (detail.paymentType === 'PAYMENT' ? (detail.mainAccount?.name ?? 'Cheques Issued') : '-')} />
            <KV label="State" value={detail.chequeStatus ?? '-'} />
            <KV label="Amount" value={money(detail.amount, 'PKR')} />
            <KV label="Entry status" value={detail.status} />
            <KV label="Created" value={dateTime(detail.createdAt)} />
            {detail.chequeStatus === 'BOUNCED' && detail.bounceReason && (
              <div className="col-span-2 sm:col-span-3">
                <KV label="Bounce reason" value={detail.bounceReason} />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!editEntry} onClose={() => setEditEntry(null)} title={`Edit cheque · ${editEntry?.number ?? ''}`} size="lg">
        {!editEntry ? null : (
          <form onSubmit={saveEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 sm:col-span-2">
              {editEntry.partyName} · {editEntry.paymentType === 'RECEIPT' ? 'Received' : 'Issued'} · {money(editEntry.amount, 'PKR')}
              {editEntry.chequeStatus ? ` · ${STATUS_BADGES[editEntry.chequeStatus]?.label ?? editEntry.chequeStatus}` : ''}
            </div>
            <Field label="Cheque number" required>
              <Input
                value={editForm.chequeNumber ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                placeholder="e.g. 00421579"
                required
              />
            </Field>
            <Field label="Cheque date" hint={editPdcFlipLocked ? 'Post-dated or not is locked after posting' : 'Leave empty for a regular cheque'}>
              <Input
                type="date"
                value={editForm.chequeDate ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, chequeDate: e.target.value || undefined }))}
              />
            </Field>
            <Field label="Party" required>
              <Select
                value={editForm.partyType ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, partyType: e.target.value as never, partyId: '' }))}
                disabled={editBankLocked}
              >
                <option value="SUPPLIER">Supplier (issued)</option>
                <option value="CUSTOMER">Customer (received)</option>
              </Select>
            </Field>
            <Field label={editForm.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier'} required hint={editBankLocked ? 'Cleared into the bank — locked' : editEntry?.allocations.length ? 'Cheque is allocated to documents — party change locked' : undefined}>
              <Select
                value={editForm.partyId ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, partyId: e.target.value || undefined }))}
                disabled={editBankLocked || (editEntry?.allocations.length ?? 0) > 0}
                required
              >
                <option value="">Select {editForm.partyType === 'CUSTOMER' ? 'customer' : 'supplier'}…</option>
                {editPartyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Bank account" hint={editBankLocked ? 'Cleared into the bank — locked' : undefined}>
              <Select
                value={editForm.bankAccountId ?? ''}
                disabled={editBankLocked}
                onChange={(e) => setEditForm((f) => ({ ...f, bankAccountId: e.target.value || undefined }))}
              >
                <option value="">Select bank…</option>
                {bankOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            {editIsPdc ? (
              <Field label="PDC account" hint={editBankLocked ? 'Cleared into the bank — locked' : 'Post-dated holding account for this party'}>
                <Select
                  value={editForm.pdcAccountId ?? ''}
                  disabled={editBankLocked}
                  onChange={(e) => setEditForm((f) => ({ ...f, pdcAccountId: e.target.value || undefined }))}
                >
                  <option value="">Select PDC account…</option>
                  {editPdcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            ) : (
              <Field label="Cash / bank (ledger) account" hint={editBankLocked ? 'Cleared into the bank — locked' : 'Where the value is booked for a regular cheque'}>
                <Select
                  value={editForm.mainAccountId ?? ''}
                  disabled={editBankLocked}
                  onChange={(e) => setEditForm((f) => ({ ...f, mainAccountId: e.target.value || undefined }))}
                >
                  <option value="">Select account…</option>
                  {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Payment date">
              <Input
                type="date"
                value={editForm.paymentDate ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, paymentDate: e.target.value }))}
              />
            </Field>
            <Field label="Amount (₨)">
              <Input
                type="number" min={0} step="0.01"
                value={editForm.amount ?? 0}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))}
              />
            </Field>
            <Field label="Reference">
              <Input
                value={editForm.reference ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="optional"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Narration">
                <Textarea
                  value={editForm.narration ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, narration: e.target.value }))}
                  placeholder="Optional note printed on the voucher…"
                />
              </Field>
            </div>
            {editError && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{editError}</div>}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
              <Button type="submit" loading={editSaving}>Save changes</Button>
            </div>
          </form>
        )}
      </Modal>

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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye, Landmark, RefreshCcw, Search } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { depositCheque, bounceCheque } from '@/lib/accounts-api';
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
import type { Paginated, PaymentEntry } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: '', label: 'All cheque states' },
  { value: 'PENDING', label: 'Pending approval' },
  { value: 'IN_HAND', label: 'In hand' },
  { value: 'CLEARED', label: 'Cleared (immediate)' },
  { value: 'DEPOSITED', label: 'Deposited' },
  { value: 'BOUNCED', label: 'Bounced' },
];

const STATUS_BADGES: Record<string, { className: string; label: string }> = {
  PENDING: { className: 'bg-amber-50 text-amber-700', label: 'Pending approval' },
  IN_HAND: { className: 'bg-blue-50 text-blue-700', label: 'In hand' },
  CLEARED: { className: 'bg-emerald-50 text-emerald-700', label: 'Cleared' },
  DEPOSITED: { className: 'bg-teal-50 text-teal-700', label: 'Deposited' },
  BOUNCED: { className: 'bg-red-50 text-red-700', label: 'Bounced' },
};

export default function ChequesRegisterPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canPost = can('accounts.payments.post');

  const [search, setSearch] = useState('');
  const [chequeStatus, setChequeStatus] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bounceEntry, setBounceEntry] = useState<PaymentEntry | null>(null);
  const [bounceReason, setBounceReason] = useState('');

  const { data, isLoading } = useQuery<Paginated<PaymentEntry>>({
    queryKey: ['cheques', page, search, chequeStatus],
    queryFn: () =>
      apiFetch(
        '/payments' +
          qs({
            page,
            pageSize: 20,
            method: 'CHEQUE',
            search: search || undefined,
            chequeStatus: chequeStatus || undefined,
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

  return (
    <div>
      <PageHeader
        title="Cheques Register"
        description="Track post-dated and regular cheques received — deposit them into the bank or mark them bounced."
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search number / party / cheque…" className="pl-9" />
          </div>
          <Select value={chequeStatus} onChange={(e) => { setChequeStatus(e.target.value); setPage(1); }} className="w-44">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        <DataTable<PaymentEntry>
          columns={[
            { key: 'number', header: 'Receipt', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.number}</span> },
            { key: 'paymentDate', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(r.paymentDate).toLocaleDateString('en-GB')}</span> },
            { key: 'party', header: 'Party', render: (r) => <span className="text-slate-700">{r.partyName ?? '-'}</span> },
            { key: 'chequeNumber', header: 'Cheque no.', render: (r) => <span className="font-mono text-slate-600">{r.chequeNumber ?? '-'}</span> },
            { key: 'chequeDate', header: 'Cheque date', render: (r) => <span className="text-slate-600">{r.chequeDate ? dateOnly(r.chequeDate) : '-'}</span> },
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
                  {r.status === 'posted' && r.chequeStatus === 'IN_HAND' && canPost && (
                    <>
                      <button onClick={() => deposit.mutate(r.id)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700" title="Clear cheque into bank">
                        <Landmark className="h-4 w-4" />
                      </button>
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
            <KV label="Receipt date" value={new Date(detail.paymentDate).toLocaleDateString('en-GB')} />
            <KV label="Cheque no." value={detail.chequeNumber ?? '-'} />
            <KV label="Cheque date" value={detail.chequeDate ? dateOnly(detail.chequeDate) : '-'} />
            <KV label="Bank" value={detail.bankAccount?.name ?? '-'} />
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

      <ConfirmDialog
        open={!!bounceEntry}
        danger
        title="Mark cheque as bounced"
        message={`This reverses the cheque (${bounceEntry?.number ?? ''}) back to ${bounceEntry?.partyName ?? 'the party'} and re-opens the allocated invoices.`}
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
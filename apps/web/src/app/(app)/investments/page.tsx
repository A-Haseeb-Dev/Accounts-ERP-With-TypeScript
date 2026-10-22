'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Eye,
  FileDown,
  FileText,
  Plus,
  Printer,
  Search,
  SkipForward,
  Trash2,
  XCircle,
} from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { downloadTablePDF, printElement } from '@/lib/report-export';
import { dateOnly, money } from '@/lib/utils';
import { toast } from 'sonner';
import type { Investment, Investor, Paginated } from '@/lib/types';

type Tab = 'investments' | 'investors';

type StatementRow = {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type InvestorStatement = {
  investor: Investor;
  from: string | null;
  to: string | null;
  openingCapital: number;
  closingCapital: number;
  totalCapitalReceived: number;
  totalReturnsPaid: number;
  totalPrincipalReturned: number;
  capitalOutstanding: number;
  activeInvestments: number;
  closedInvestments: number;
  nextDueDate: string | null;
  investments: {
    id: string;
    number: string;
    principal: number;
    status: string;
    startDate: string;
    receivedAt: string | null;
    closedAt: string | null;
    returnsPaid: number;
    principalReturned: number;
    principalOutstanding: number;
  }[];
  rows: StatementRow[];
};

export default function InvestmentsPage() {
  const [tab, setTab] = useState<Tab>('investments');

  return (
    <div>
      <PageHeader
        title="Investments"
        description="Money placed with the business by investors - the principal received, the monthly returns paid and the capital returned at maturity."
      />

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        <TabButton active={tab === 'investments'} onClick={() => setTab('investments')}>
          Investments
        </TabButton>
        <TabButton active={tab === 'investors'} onClick={() => setTab('investors')}>
          Investors
        </TabButton>
      </div>

      {tab === 'investments' ? <InvestmentsTab /> : <InvestorsTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Investments                                                        */
/* ------------------------------------------------------------------ */

function InvestmentsTab() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('investments.create');
  const canUpdate = can('investments.update');
  const canDelete = can('investments.delete');
  const canReceive = can('investments.receive');
  const canPayout = can('investments.payout');
  const canClose = can('investments.close');

  const { options: accountOptions } = useFlatOptions('main-accounts');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<Investment | null>(null);
  const [closeTarget, setCloseTarget] = useState<Investment | null>(null);
  const [payTarget, setPayTarget] = useState<{ investment: Investment; installmentId: string; amount: number; kind: string } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [rescheduleTarget, setRescheduleTarget] = useState<{ investmentId: string; installmentId: string; sequence: number; dueDate: string; amount: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Investment | null>(null);

  const { data, isLoading } = useQuery<Paginated<Investment>>({
    queryKey: ['investments', page, search, status],
    queryFn: () => apiFetch('/investments' + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<Investment | null>({
    queryKey: ['investments', 'detail', detailId],
    queryFn: () => apiFetch(`/investments/${detailId}`),
    enabled: !!detailId,
  });

  const { data: investors } = useQuery<Paginated<Investor>>({
    queryKey: ['investments/investors', 'all'],
    queryFn: () => apiFetch('/investments/investors' + qs({ page: 1, pageSize: 200 })),
  });

  const { data: nextNumber } = useQuery<string>({
    queryKey: ['investments', 'next-number'],
    queryFn: () => apiFetch<{ number: string }>('/investments/next-number').then((r) => r.number),
    enabled: modalOpen,
    staleTime: 0,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['investments'] });
    qc.invalidateQueries({ queryKey: ['investments/investors'] });
  };

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch<Investment>('/investments', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditId(null);
      setForm({});
      toast.success('Investment recorded');
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not save the investment');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      apiFetch<Investment>(`/investments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditId(null);
      setForm({});
      toast.success('Investment updated');
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not update the investment');
    },
  });

  const receive = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      apiFetch<Investment>(`/investments/${id}/receive`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setReceiveTarget(null);
      toast.success('Money received - the capital account is credited');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not record the money received'),
  });

  const pay = useMutation({
    mutationFn: ({ id, installmentId, payload }: { id: string; installmentId: string; payload: unknown }) =>
      apiFetch<Investment>(`/investments/${id}/installments/${installmentId}/pay`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidate();
      setPayTarget(null);
      setPayAmount('');
      toast.success('Payout recorded');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not record the payout'),
  });

  const skip = useMutation({
    mutationFn: ({ id, installmentId }: { id: string; installmentId: string }) =>
      apiFetch(`/investments/${id}/installments/${installmentId}/skip`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      invalidate();
      toast.success('Installment skipped');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not skip the installment'),
  });

  const reschedule = useMutation({
    mutationFn: ({ id, installmentId, payload }: { id: string; installmentId: string; payload: unknown }) =>
      apiFetch(`/investments/${id}/installments/${installmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidate();
      setRescheduleTarget(null);
      toast.success('Installment rescheduled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not reschedule the installment'),
  });

  const close = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      apiFetch<Investment>(`/investments/${id}/close`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setCloseTarget(null);
      toast.success('Investment closed - the principal has been returned');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not close the investment'),
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/investments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      invalidate();
      toast.success('Investment cancelled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not cancel the investment'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/investments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success('Investment deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not delete the investment'),
  });

  const openCreate = () => {
    setEditId(null);
    setForm({
      investorId: '',
      principal: 0,
      startDate: new Date().toISOString().slice(0, 10),
      termMonths: 6,
      returnType: 'FIXED',
      monthlyReturn: 0,
      profitSharePercent: 0,
      fundingAccountId: '',
      note: '',
    });
    setError('');
    setModalOpen(true);
  };

  const startEdit = (record: Investment) => {
    setForm({
      investorId: record.investorId,
      principal: Number(record.principal),
      termMonths: record.termMonths,
      returnType: record.returnType,
      monthlyReturn: Number(record.monthlyReturn),
      profitSharePercent: Number(record.profitSharePercent ?? 0),
      fundingAccountId: record.fundingAccountId ?? '',
      note: record.note ?? '',
    });
    setEditId(record.id);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      investorId: String(form.investorId ?? ''),
      principal: Number(form.principal ?? 0),
      startDate: form.startDate ? String(form.startDate) : undefined,
      termMonths: Number(form.termMonths ?? 6),
      returnType: String(form.returnType ?? 'FIXED'),
      monthlyReturn: Number(form.monthlyReturn ?? 0),
      profitSharePercent: Number(form.profitSharePercent ?? 0),
      fundingAccountId: form.fundingAccountId ? String(form.fundingAccountId) : undefined,
      note: form.note || undefined,
    };
    if (editId) update.mutate({ id: editId, payload });
    else create.mutate(payload);
  };

  const isProfitShare = form.returnType === 'PROFIT_SHARE';

  return (
    <div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search number / investorâ€¦" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All status</option>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          {canCreate && (
            <Button className="ml-auto" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New Investment
            </Button>
          )}
        </div>

        <DataTable<Investment>
          columns={[
            { key: 'number', header: 'Number', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.number}</span> },
            { key: 'investor', header: 'Investor', render: (r) => <span className="text-slate-700">{r.investor?.name ?? '-'}</span> },
            { key: 'startDate', header: 'Start', render: (r) => <span className="text-slate-600">{dateOnly(r.startDate)}</span> },
            { key: 'principal', header: 'Principal', align: 'right', render: (r) => <span className="tabular-nums text-slate-800">{money(r.principal ?? 0)}</span> },
            { key: 'monthlyReturn', header: 'Return / month', align: 'right', render: (r) => (
              <span className="tabular-nums text-slate-600">
                {r.returnType === 'PROFIT_SHARE' ? `${r.profitSharePercent}% share` : money(r.monthlyReturn ?? 0)}
              </span>
            ) },
            { key: 'outstanding', header: 'Still owed', align: 'right', render: (r) => <span className="tabular-nums font-medium text-teal-700">{money(r.principalOutstanding ?? 0)}</span> },
            { key: 'nextDueDate', header: 'Next due', render: (r) => <span className="text-slate-600">{r.nextDueDate ? dateOnly(r.nextDueDate) : '-'}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions',
              header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setDetailId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View">
                    <Eye className="h-4 w-4" />
                  </button>
                  {canReceive && !r.receivedAt && r.status !== 'cancelled' && (
                    <button onClick={() => setReceiveTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Record money received">
                      <Banknote className="h-4 w-4" />
                    </button>
                  )}
                  {canPayout && r.status === 'active' && (
                    <button
                      onClick={() => {
                        const next = (r.installments ?? []).find((i) => i.status === 'pending');
                        if (next) {
                          setPayTarget({ investment: r, installmentId: next.id, amount: Number(next.amount ?? 0), kind: next.kind });
                          setPayAmount(String(next.amount ?? 0));
                          setPayDate(new Date().toISOString().slice(0, 10));
                        }
                      }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700"
                      title="Pay the next installment"
                    >
                      <CalendarClock className="h-4 w-4" />
                    </button>
                  )}
                  {canClose && r.status === 'active' && (
                    <button onClick={() => setCloseTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" title="Close and return the principal">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  {canUpdate && (r.status === 'planned' || r.status === 'active') && (
                    <button onClick={() => startEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="Edit">
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                  {canUpdate && r.status === 'planned' && !r.receivedAt && (
                    <button onClick={() => cancel.mutate({ id: r.id, reason: 'Cancelled from UI' })} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Cancel">
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && !r.receivedAt && (
                    <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Investment' : 'New Investment'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Investor" required>
              <Select
                value={String(form.investorId ?? '')}
                onChange={(e) => setForm((f) => ({ ...f, investorId: e.target.value }))}
                required
                disabled={!!editId}
              >
                <option value="">Select investorâ€¦</option>
                {(investors?.items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>{i.code} Â· {i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reference">
              <Input value={nextNumber ?? ''} disabled className="font-mono" title="Auto-generated on save" />
            </Field>
            <Field label="Principal" required hint="The money the investor is putting in.">
              <Input type="number" min={0} step="0.01" value={String(form.principal ?? 0)} onChange={(e) => setForm((f) => ({ ...f, principal: Number(e.target.value) || 0 }))} required />
            </Field>
            <Field label="Start Date" required>
              <Input type="date" value={String(form.startDate ?? '')} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
            </Field>
            <Field label="Term (months)" required>
              <Input type="number" min={1} step={1} value={String(form.termMonths ?? 6)} onChange={(e) => setForm((f) => ({ ...f, termMonths: Number(e.target.value) || 1 }))} required />
            </Field>
            <Field label="Return Type" required>
              <Select value={String(form.returnType ?? 'FIXED')} onChange={(e) => setForm((f) => ({ ...f, returnType: e.target.value }))}>
                <option value="FIXED">Fixed monthly return</option>
                <option value="PROFIT_SHARE">Profit share</option>
              </Select>
            </Field>
            {isProfitShare ? (
              <Field label="Profit Share %" required>
                <Input type="number" min={0} step="0.01" value={String(form.profitSharePercent ?? 0)} onChange={(e) => setForm((f) => ({ ...f, profitSharePercent: Number(e.target.value) || 0 }))} required />
              </Field>
            ) : (
              <Field label="Monthly Return" required>
                <Input type="number" min={0} step="0.01" value={String(form.monthlyReturn ?? 0)} onChange={(e) => setForm((f) => ({ ...f, monthlyReturn: Number(e.target.value) || 0 }))} required />
              </Field>
            )}
            <Field label="Funding Account" hint="The cash or bank account the money moves through.">
              <Select value={String(form.fundingAccountId ?? '')} onChange={(e) => setForm((f) => ({ ...f, fundingAccountId: e.target.value }))}>
                <option value="">Choose when the money is received</option>
                {accountOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Note">
            <Textarea value={String(form.note ?? '')} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional notesâ€¦" />
          </Field>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editId ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail?.number ?? 'Investment'} size="lg">
        {detailLoading || !detail ? null : (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact label="Investor" value={detail.investor?.name ?? '-'} />
              <Fact label="Principal" value={money(detail.principal)} />
              <Fact label="Status" value={detail.status.toUpperCase()} />
              <Fact label="Still owed" value={money(detail.principalOutstanding ?? 0)} />
              <Fact label="Returns paid" value={money(detail.returnsPaid ?? 0)} />
              <Fact label="Start date" value={dateOnly(detail.startDate)} />
              <Fact label="Funding account" value={detail.fundingAccount?.name ?? '-'} />
              <Fact label="Next due" value={detail.nextDueDate ? dateOnly(detail.nextDueDate) : '-'} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(detail.installments ?? []).map((it) => (
                    <tr key={it.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-500">{it.sequence}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {it.kind === 'PRINCIPAL' ? 'Principal' : 'Return'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{dateOnly(it.dueDate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">{money(it.amount ?? 0)}</td>
                      <td className="px-3 py-2">
                        {it.overdue ? <Badge tone="red">Overdue</Badge> : <StatusBadge status={it.status} />}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canPayout && it.status === 'pending' && detail.status === 'active' && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setPayTarget({ investment: detail, installmentId: it.id, amount: Number(it.amount ?? 0), kind: it.kind });
                                setPayAmount(String(it.amount ?? 0));
                                setPayDate(new Date().toISOString().slice(0, 10));
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700"
                              title="Pay"
                            >
                              <Banknote className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() =>
                                setRescheduleTarget({
                                  investmentId: detail.id,
                                  installmentId: it.id,
                                  sequence: it.sequence,
                                  dueDate: String(it.dueDate).slice(0, 10),
                                  amount: String(it.amount ?? 0),
                                })
                              }
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                              title="Reschedule this installment"
                            >
                              <CalendarClock className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => skip.mutate({ id: detail.id, installmentId: it.id })}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              title="Skip this installment"
                            >
                              <SkipForward className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!!detail.note && <p className="mt-3 text-xs text-slate-500">Note: {detail.note}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!receiveTarget}
        title="Record money received"
        message={`The funding account is debited and the capital account credited for ${money(receiveTarget?.principal ?? 0)}.`}
        confirmLabel="Record receipt"
        loading={receive.isPending}
        onCancel={() => setReceiveTarget(null)}
        onConfirm={() => receiveTarget && receive.mutate({ id: receiveTarget.id, payload: {} })}
      />

      <ConfirmDialog
        open={!!payTarget}
        title={payTarget?.kind === 'PRINCIPAL' ? 'Return the principal' : 'Pay the return'}
        message={`Pay ${money(payTarget?.amount ?? 0)} to ${detail?.investor?.name ?? 'the investor'} and post the voucher.`}
        confirmLabel="Pay"
        loading={pay.isPending}
        onCancel={() => setPayTarget(null)}
        onConfirm={() =>
          payTarget &&
          pay.mutate({
            id: payTarget.investment.id,
            installmentId: payTarget.installmentId,
            payload: { amount: Number(payAmount || 0), paidDate: payDate },
          })
        }
      >
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Amount" required>
            <Input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
          </Field>
          <Field label="Payment date" required>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
          </Field>
        </div>
      </ConfirmDialog>

      <Modal
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        title={`Reschedule installment ${rescheduleTarget?.sequence ?? ''}`}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rescheduleTarget) return;
            reschedule.mutate({
              id: rescheduleTarget.investmentId,
              installmentId: rescheduleTarget.installmentId,
              payload: {
                dueDate: rescheduleTarget.dueDate || undefined,
                amount: Number(rescheduleTarget.amount || 0),
              },
            });
          }}
          className="space-y-4"
        >
          <Field label="Due date" required>
            <Input
              type="date"
              value={rescheduleTarget?.dueDate ?? ''}
              onChange={(e) =>
                setRescheduleTarget((t) => (t ? { ...t, dueDate: e.target.value } : t))
              }
              required
            />
          </Field>
          <Field label="Amount" hint="Moving a skipped row to a date puts it back on the schedule.">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={rescheduleTarget?.amount ?? ''}
              onChange={(e) =>
                setRescheduleTarget((t) => (t ? { ...t, amount: e.target.value } : t))
              }
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setRescheduleTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={reschedule.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!closeTarget}
        danger
        title="Close the investment"
        message={`The principal still owed (${money(closeTarget?.principalOutstanding ?? 0)}) goes back to the investor and the arrangement ends.`}
        confirmLabel="Close investment"
        loading={close.isPending}
        onCancel={() => setCloseTarget(null)}
        onConfirm={() => closeTarget && close.mutate({ id: closeTarget.id, payload: {} })}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete investment"
        message="This permanently removes the investment. Only an investment that never touched the ledger can be deleted."
        confirmLabel="Delete"
        loading={remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Investors                                                          */
/* ------------------------------------------------------------------ */

function InvestorsTab() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('investments.investor.create');
  const canUpdate = can('investments.investor.update');
  const canDelete = can('investments.investor.delete');

  const { options: accountOptions } = useFlatOptions('main-accounts');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Investor | null>(null);
  const [statementId, setStatementId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Paginated<Investor>>({
    queryKey: ['investments/investors', page, search],
    queryFn: () => apiFetch('/investments/investors' + qs({ page, pageSize: 20, search: search || undefined })),
  });

  const { data: statement, isLoading: statementLoading } = useQuery<InvestorStatement>({
    queryKey: ['investments/investors', 'statement', statementId],
    queryFn: () => apiFetch(`/investments/investors/${statementId}/statement`),
    enabled: !!statementId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['investments/investors'] });

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/investments/investors', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditId(null);
      setForm({});
      toast.success('Investor added');
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not add the investor');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      apiFetch(`/investments/investors/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditId(null);
      setForm({});
      toast.success('Investor updated');
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message || 'Could not update the investor');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/investments/investors/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success('Investor removed');
    },
    onError: (e: Error) => {
      setDeleteTarget(null);
      toast.error(e.message || 'Could not remove the investor');
    },
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ code: '', name: '', phone: '', email: '', cnic: '', address: '', mainAccountId: '', openingBalance: 0, note: '' });
    setError('');
    setModalOpen(true);
  };

  const startEdit = (record: Investor) => {
    setForm({
      code: record.code,
      name: record.name,
      phone: record.phone ?? '',
      email: record.email ?? '',
      cnic: record.cnic ?? '',
      address: record.address ?? '',
      mainAccountId: record.mainAccountId ?? '',
      note: record.note ?? '',
    });
    setEditId(record.id);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...(editId ? {} : { code: String(form.code ?? '').trim() || undefined }),
      name: String(form.name ?? ''),
      phone: form.phone || undefined,
      email: form.email || undefined,
      cnic: form.cnic || undefined,
      address: form.address || undefined,
      mainAccountId: form.mainAccountId ? String(form.mainAccountId) : undefined,
      note: form.note || undefined,
      ...(editId ? {} : { openingBalance: Number(form.openingBalance ?? 0) }),
    };
    if (editId) update.mutate({ id: editId, payload });
    else create.mutate(payload);
  };

  return (
    <div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name / code / phoneâ€¦" className="pl-9" />
          </div>
          {canCreate && (
            <Button className="ml-auto" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New Investor
            </Button>
          )}
        </div>

        <DataTable<Investor>
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-medium text-slate-700">{r.code}</span> },
            { key: 'name', header: 'Name', render: (r) => <span className="text-slate-800">{r.name}</span> },
            { key: 'phone', header: 'Phone', render: (r) => <span className="text-slate-600">{r.phone ?? '-'}</span> },
            { key: 'mainAccount', header: 'Account', render: (r) => (
              <span className="font-mono text-xs text-slate-500">
                {r.mainAccount ? `${r.mainAccount.code} Â· ${r.mainAccount.name}` : '-'}
              </span>
            ) },
            { key: 'capitalOutstanding', header: 'Capital owed', align: 'right', render: (r) => <span className="tabular-nums font-medium text-teal-700">{money(r.capitalOutstanding ?? 0)}</span> },
            { key: 'accountBalance', header: 'Ledger balance', align: 'right', render: (r) => <span className="tabular-nums text-slate-600">{money(r.accountBalance ?? 0)}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions',
              header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setStatementId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Statement">
                    <FileText className="h-4 w-4" />
                  </button>
                  {canUpdate && (
                    <button onClick={() => startEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="Edit">
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Remove">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Investor' : 'New Investor'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code" hint={editId ? undefined : 'Leave blank to generate one.'}>
              <Input value={String(form.code ?? '')} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} disabled={!!editId} placeholder="e.g. INV-0001" />
            </Field>
            <Field label="Name" required>
              <Input value={String(form.name ?? '')} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </Field>
            <Field label="Phone">
              <Input value={String(form.phone ?? '')} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="CNIC">
              <Input value={String(form.cnic ?? '')} onChange={(e) => setForm((f) => ({ ...f, cnic: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={String(form.email ?? '')} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            {!editId && (
              <Field label="Opening Balance" hint="What this investor already owed the business.">
                <Input type="number" min={0} step="0.01" value={String(form.openingBalance ?? 0)} onChange={(e) => setForm((f) => ({ ...f, openingBalance: Number(e.target.value) || 0 }))} />
              </Field>
            )}
          </div>

          <Field label="Ledger Account" hint="The account that carries the capital owed to this investor. One is opened for them when this is left blank.">
            <Select value={String(form.mainAccountId ?? '')} onChange={(e) => setForm((f) => ({ ...f, mainAccountId: e.target.value }))}>
              <option value="">Open a dedicated account</option>
              {accountOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Address">
            <Textarea value={String(form.address ?? '')} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editId ? 'Save changes' : 'Add investor'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!statementId}
        onClose={() => setStatementId(null)}
        title={statement ? `Statement - ${statement.investor.name}` : 'Investor statement'}
        size="xl"
      >
        {statementLoading || !statement ? null : (
          <div>
            <div className="mb-3 flex flex-wrap justify-end gap-2 print:hidden">
              <Button variant="outline" size="md" onClick={() => printElement('investor-statement', 'Investor Statement')}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() =>
                  downloadTablePDF('investor-statement', `statement-${statement.investor.code}`, 'Investor Statement')
                }
              >
                <FileDown className="h-4 w-4" /> PDF
              </Button>
            </div>

            <div id="investor-statement" className="rounded-lg bg-white p-1">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{statement.investor.name}</h3>
                  <p className="text-xs text-slate-500">
                    {statement.investor.code}
                    {statement.investor.phone ? ` · ${statement.investor.phone}` : ''}
                    {statement.investor.cnic ? ` · CNIC ${statement.investor.cnic}` : ''}
                  </p>
                  {statement.investor.mainAccount && (
                    <p className="text-xs text-slate-500">
                      Ledger: {statement.investor.mainAccount.code} · {statement.investor.mainAccount.name}
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {statement.from || statement.to
                    ? `${statement.from ?? 'Start'} to ${statement.to ?? 'Today'}`
                    : 'All transactions'}
                </p>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Fact label="Capital received" value={money(statement.totalCapitalReceived)} />
                <Fact label="Principal returned" value={money(statement.totalPrincipalReturned)} />
                <Fact label="Capital outstanding" value={money(statement.capitalOutstanding)} />
                <Fact label="Returns paid" value={money(statement.totalReturnsPaid)} />
                <Fact label="Active investments" value={String(statement.activeInvestments)} />
                <Fact label="Closed investments" value={String(statement.closedInvestments)} />
                <Fact label="Next due" value={statement.nextDueDate ? dateOnly(statement.nextDueDate) : '-'} />
                <Fact label="Closing capital" value={money(statement.closingCapital)} />
              </div>

              {statement.investments.length > 0 && (
                <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                        <th className="px-3 py-2">Investment</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Principal</th>
                        <th className="px-3 py-2 text-right">Returns paid</th>
                        <th className="px-3 py-2 text-right">Principal returned</th>
                        <th className="px-3 py-2 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.investments.map((inv) => (
                        <tr key={inv.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{inv.number}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-800">{money(inv.principal)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(inv.returnsPaid)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(inv.principalReturned)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-teal-700">{money(inv.principalOutstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Investment</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Paid out</th>
                      <th className="px-3 py-2 text-right">Received</th>
                      <th className="px-3 py-2 text-right">Capital balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.rows.map((row, index) => (
                      <tr key={`${row.reference}-${row.type}-${index}`} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{row.date}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.reference}</td>
                        <td className="px-3 py-2 text-slate-700">{row.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">{row.debit ? money(row.debit) : ''}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-teal-700">{row.credit ? money(row.credit) : ''}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{money(row.balance)}</td>
                      </tr>
                    ))}
                    {statement.rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                          No transactions in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Remove investor"
        message="An investor with investments on record cannot be removed - the history of the money has to stay."
        confirmLabel="Remove"
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


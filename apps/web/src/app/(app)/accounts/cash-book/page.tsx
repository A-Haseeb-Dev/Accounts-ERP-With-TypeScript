'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckCircle2, Eye, Plus, Trash2 } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { createVoucher, deleteVoucher } from '@/lib/accounts-api';
import type { VoucherPayload } from '@/lib/accounts-api';
import { useAuth } from '@/context/auth-context';
import { useAccountingAccounts } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { money } from '@/lib/utils';
import type { CashBookRow, Paginated, Voucher, VoucherEntry, VoucherType } from '@/lib/types';

interface CashBookGroup {
  month: string;
  monthLabel: string;
  rows: CashBookRow[];
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

interface Entry {
  key: string;
  mainAccountId: string;
  debit: number;
  credit: number;
  narration?: string;
}

const newKey = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export default function CashBookPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('accounts.vouchers.create');
  const canPost = can('accounts.vouchers.post');
  const canDelete = can('accounts.vouchers.delete');
  const { options: accountOptions } = useAccountingAccounts();
  const [mode, setMode] = useState<'chronological' | 'byMonth'>('chronological');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<CashBookRow | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'easy' | 'advanced'>('easy');
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<VoucherType>('JOURNAL');
  const [formReference, setFormReference] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEntries, setFormEntries] = useState<Entry[]>([]);
  const [formError, setFormError] = useState('');

  const [inDirection, setInDirection] = useState<'IN' | 'OUT'>('IN');
  const [inAmount, setInAmount] = useState(0);
  const [inAccountId, setInAccountId] = useState('');
  const [inCashAccountId, setInCashAccountId] = useState('');

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
    staleTime: 5 * 60 * 1000,
  });
  const cashAccountId = settings?.['accounting.cash_account'] ?? '';

  const { data, isLoading } = useQuery<Paginated<CashBookRow> & { totalRunning?: number }>({
    queryKey: ['cashbook', mode, page, from, to, search],
    queryFn: () => apiFetch('/vouchers/cash-book' + qs({ page, pageSize: mode === 'byMonth' ? 10000 : 20, from: from || undefined, to: to || undefined, search: search || undefined })),
  });

  const groups: CashBookGroup[] = (() => {
    if (mode !== 'byMonth' || !data?.items?.length) return [];
    let running = 0;
    let lastMonth = '';
    let current: CashBookGroup | null = null;
    let first = true;
    const out: CashBookGroup[] = [];
    for (const r of data.items) {
      running = first ? (Number(r.runningBalance ?? 0) - (Number(r.debit ?? 0) - Number(r.credit ?? 0))) : running;
      first = false;
      running += Number(r.debit ?? 0) - Number(r.credit ?? 0);
      const d = new Date(r.date ?? r.voucherDate);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (month !== lastMonth) {
        if (current) out.push(current);
        current = { month, monthLabel, rows: [], opening: running - (Number(r.debit ?? 0) - Number(r.credit ?? 0)), debit: 0, credit: 0, closing: 0 };
        lastMonth = month;
      }
      if (!current) continue;
      current.rows.push(r);
      current.debit += Number(r.debit ?? 0);
      current.credit += Number(r.credit ?? 0);
      current.closing = running;
    }
    if (current) out.push(current);
    return out;
  })();

  const voucherIdOf = (r: CashBookRow): string | null => {
    const v = r.voucher ?? r;
    return v.id ?? null;
  };

  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detail, isLoading: detailLoading } = useQuery<Voucher | null>({
    queryKey: ['voucher', detailId],
    queryFn: () => apiFetch(`/vouchers/${detailId}`),
    enabled: !!detailId,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteVoucher(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setDeleteTarget(null);
      setDeleteError('');
      toast.success('Voucher deleted from cash book');
    },
    onError: (e: Error) => {
      setDeleteError(e.message);
      toast.error(e.message || 'Could not delete voucher');
    },
  });

  const openDelete = (r: CashBookRow) => {
    setDeleteError('');
    setDeleteTarget(r);
  };

  const { data: nextNumber } = useQuery<string>({
    queryKey: ['vouchers', 'next-number', formType],
    queryFn: () => apiFetch<{ number: string }>(`/vouchers/next-number?voucherType=${formType}`).then((r) => r.number),
    enabled: formOpen,
    staleTime: 0,
  });

  const createEntry = useMutation({
    mutationFn: async (payload: VoucherPayload) => {
      const voucher = await createVoucher(payload);
      // The cash book only lists posted vouchers, so a direct entry would be
      // invisible until someone posts it from the Vouchers screen. Post it
      // right away when the user holds the posting permission.
      if (canPost) await apiFetch(`/vouchers/${voucher.id}/post`, { method: 'POST' });
      return voucher;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['vouchers', 'next-number'] });
      setFormOpen(false);
      toast.success(canPost ? 'Direct entry posted to the cash book' : 'Direct entry saved as a draft');
    },
    onError: (e: Error) => {
      setFormError(e.message);
      toast.error(e.message || 'Could not create direct entry');
    },
  });

  const openForm = () => {
    setFormMode('easy');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormType('JOURNAL');
    setFormReference('');
    setFormDescription('');
    setFormEntries([
      { key: newKey(), mainAccountId: cashAccountId, debit: 0, credit: 0 },
      { key: newKey(), mainAccountId: '', debit: 0, credit: 0 },
    ]);
    setInDirection('IN');
    setInAmount(0);
    setInAccountId('');
    setInCashAccountId(cashAccountId);
    setFormError('');
    setFormOpen(true);
  };

  const addEntry = () => setFormEntries((es) => [...es, { key: newKey(), mainAccountId: '', debit: 0, credit: 0 }]);
  const updateEntry = (key: string, patch: Partial<Entry>) =>
    setFormEntries((es) => es.map((en) => (en.key === key ? { ...en, ...patch } : en)));
  const removeEntry = (key: string) => setFormEntries((es) => es.filter((en) => en.key !== key));

  const formTotalDebit = formEntries.reduce((s, e) => s + Number(e.debit || 0), 0);
  const formTotalCredit = formEntries.reduce((s, e) => s + Number(e.credit || 0), 0);
  const formBalanced = Math.abs(formTotalDebit - formTotalCredit) < 0.01 && formTotalDebit > 0;

  const easyCashId = inCashAccountId || cashAccountId;
  const easyAmount = Number(inAmount) || 0;
  const easyValid = !!easyCashId && !!inAccountId && easyAmount > 0;
  const easyCashLabel = accountOptions.find((o) => o.value === easyCashId)?.label ?? 'Cash / Bank';
  const easyOtherLabel = accountOptions.find((o) => o.value === inAccountId)?.label ?? (inDirection === 'IN' ? 'Source account' : 'Expense account');

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (formMode === 'easy') {
      if (!easyCashId) {
        setFormError('Select the cash / bank account.');
        return;
      }
      if (!inAccountId) {
        setFormError(inDirection === 'IN' ? 'Select where the money came from.' : 'Select where the money was spent.');
        return;
      }
      if (easyAmount <= 0) {
        setFormError('Enter an amount greater than zero.');
        return;
      }
      const entries =
        inDirection === 'IN'
          ? [
              { mainAccountId: easyCashId, debit: easyAmount, credit: 0, narration: formDescription || undefined },
              { mainAccountId: inAccountId, debit: 0, credit: easyAmount, narration: formDescription || undefined },
            ]
          : [
              { mainAccountId: inAccountId, debit: easyAmount, credit: 0, narration: formDescription || undefined },
              { mainAccountId: easyCashId, debit: 0, credit: easyAmount, narration: formDescription || undefined },
            ];
      createEntry.mutate({
        voucherType: formType,
        voucherDate: formDate,
        reference: formReference || undefined,
        description: formDescription || undefined,
        entries,
      });
      return;
    }

    if (formEntries.filter((en) => en.mainAccountId).length < 2) {
      setFormError('A direct entry needs at least two accounts (one debit, one credit).');
      return;
    }
    if (!formBalanced) {
      setFormError(`Entries don't balance: debit ${money(formTotalDebit)} vs credit ${money(formTotalCredit)}.`);
      return;
    }
    createEntry.mutate({
      voucherType: formType,
      voucherDate: formDate,
      reference: formReference || undefined,
      description: formDescription || undefined,
      entries: formEntries
        .filter((en) => en.mainAccountId)
        .map((en) => ({
          mainAccountId: en.mainAccountId,
          debit: Number(en.debit) || 0,
          credit: Number(en.credit) || 0,
          narration: en.narration || undefined,
        })),
    });
  };

  return (
    <div>
      <PageHeader
        title="Cash Book"
        description="Chronological cash account activity and running balance."
        actions={
          canCreate ? (
            <Button onClick={openForm}>
              <Plus className="h-4 w-4" /> Direct Entry
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={mode} onChange={(e) => { setMode(e.target.value as 'chronological' | 'byMonth'); setPage(1); }} className="w-40">
              <option value="chronological">Chronological</option>
              <option value="byMonth">By month</option>
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search voucher…" className="max-w-xs" />
        </div>

        {mode === 'byMonth' ? (
          <div id="cashbook-report" className="overflow-x-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-800">Cash Book — Monthly Summary</span>
              <span className="text-slate-500">{from ? `Period: ${from}${to ? ` to ${to}` : ''}` : 'All dates'}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Month</th>
                  <th className="px-4 py-2">Entries</th>
                  <th className="px-4 py-2 text-right">Opening</th>
                  <th className="px-4 py-2 text-right">Receipts</th>
                  <th className="px-4 py-2 text-right">Payments</th>
                  <th className="px-4 py-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
                )}
                {groups.map((g) => (
                  <tr key={g.month} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-semibold text-slate-800">{g.monthLabel}</td>
                    <td className="px-4 py-2 text-slate-500">{g.rows.length}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{money(g.opening)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-teal-600">{money(g.debit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{money(g.credit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(g.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {groups.length > 0 && (
              <div className="flex justify-end border-t border-slate-100 px-4 py-3 text-sm">
                <span className="text-slate-500">Closing balance: </span>
                <span className="ml-1.5 font-semibold tabular-nums text-slate-800">{money(groups[groups.length - 1].closing)}</span>
              </div>
            )}
          </div>
        ) : (
          <>
        <DataTable<CashBookRow>
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(r.date ?? r.voucherDate).toLocaleDateString('en-GB')}</span> },
            { key: 'voucher', header: 'Voucher', render: (r) => {
              return <span className="font-mono font-semibold text-slate-800">{r.voucher?.number ?? ''}</span>;
            } },
            { key: 'reference', header: 'Reference', render: (r) => <span className="text-slate-600">{r.reference ?? '—'}</span> },
            { key: 'description', header: 'Description', render: (r) => <span className="text-slate-600">{r.description ?? '—'}</span> },
            { key: 'debit', header: 'Receipts', align: 'right', render: (r) => <span className="tabular-nums text-teal-600">{r.debit ? money(r.debit) : ''}</span> },
            { key: 'credit', header: 'Payments', align: 'right', render: (r) => <span className="tabular-nums text-red-600">{r.credit ? money(r.credit) : ''}</span> },
            { key: 'runningBalance', header: 'Balance', align: 'right', render: (r) => <span className="font-medium tabular-nums text-slate-800">{money(r.runningBalance)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => { const id = voucherIdOf(r); if (id) setDetailId(id); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View voucher"><Eye className="h-4 w-4" /></button>
                  {canDelete && voucherIdOf(r) && (
                    <button onClick={() => openDelete(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete voucher">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id ?? JSON.stringify(r)}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />

        <div className="flex justify-end border-t border-slate-100 px-4 py-3 text-sm">
          <span className="text-slate-500">Closing balance: </span>
          <span className="ml-1.5 font-semibold tabular-nums text-slate-800">{money(data?.totalRunning ?? 0)}</span>
        </div>
        </>
        )}
      </Card>

      <VoucherDetailModal open={!!detailId} loading={detailLoading} detail={detail} onClose={() => setDetailId(null)} />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Cash Book — Direct Entry" size="lg">
        <form onSubmit={submitForm} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setFormMode('easy')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${formMode === 'easy' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Easy (Money In / Out)
              </button>
              <button
                type="button"
                onClick={() => setFormMode('advanced')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${formMode === 'advanced' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Advanced (Dr / Cr)
              </button>
            </div>
            <span className="text-xs text-slate-400">
              {formMode === 'easy' ? 'Sirf amount aur account — entry khud ban jayegi.' : 'Puri double-entry khud likhein.'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Date" required>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required />
            </Field>
            <Field label="Type" required hint="Journal = normal entry">
              <Select value={formType} onChange={(e) => setFormType(e.target.value as VoucherType)}>
                <option value="JOURNAL">Journal</option>
                <option value="CREDIT">Credit Note</option>
                <option value="DEBIT">Debit Note</option>
              </Select>
            </Field>
            <Field label="Number">
              <Input value={nextNumber ?? ''} disabled className="font-mono" title="Auto-generated on save" />
            </Field>
            <Field label="Reference">
              <Input value={formReference} onChange={(e) => setFormReference(e.target.value)} placeholder="optional" />
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
          </Field>

          {formMode === 'easy' ? (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Paisa aa raha hai ya ja raha hai?</p>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setInDirection('IN')}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${inDirection === 'IN' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Money In (cash aaya)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInDirection('OUT')}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${inDirection === 'OUT' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Money Out (cash gaya)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label={inDirection === 'IN' ? 'Cash / Bank account (jisme aaya)' : 'Cash / Bank account (jisse gaya)'} required>
                  <Select value={easyCashId} onChange={(e) => setInCashAccountId(e.target.value)}>
                    <option value="">Select account…</option>
                    {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label={inDirection === 'IN' ? 'Received from (kahan se aaya)' : 'Paid to / Spent on (kis par kharch)'} required>
                  <Select value={inAccountId} onChange={(e) => setInAccountId(e.target.value)}>
                    <option value="">Select account…</option>
                    {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label={`Amount${inDirection === 'IN' ? ' (jo aaya)' : ' (jo gaya)'}`} required>
                  <Input type="number" min={0} step="0.01" value={inAmount ? String(inAmount) : ''} onChange={(e) => setInAmount(Number(e.target.value) || 0)} className="text-right" placeholder="0.00" />
                </Field>
              </div>

              {easyValid && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Entry banegi: <span className="font-semibold text-teal-700">Dr</span> {inDirection === 'IN' ? easyCashLabel : easyOtherLabel}
                  {' · '}
                  <span className="font-semibold text-red-600">Cr</span> {inDirection === 'IN' ? easyOtherLabel : easyCashLabel}
                  {' · '}{money(easyAmount)}
                </p>
              )}

              {!cashAccountId && (
                <p className="text-xs text-amber-600">No default cash account set (Settings › Accounting). Pick the cash / bank account above so the cash book uses it.</p>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Accounting Entries</p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-3 py-2">Account</th>
                      <th className="w-32 px-3 py-2 text-right">
                        Debit
                        <span className="block text-[10px] font-normal normal-case text-teal-600">Money In (cash aaya)</span>
                      </th>
                      <th className="w-32 px-3 py-2 text-right">
                        Credit
                        <span className="block text-[10px] font-normal normal-case text-red-600">Money Out (cash gaya)</span>
                      </th>
                      <th className="px-3 py-2">Narration</th>
                      <th className="w-10 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formEntries.map((en) => (
                      <tr key={en.key} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-1.5">
                          <Select value={en.mainAccountId} onChange={(e) => updateEntry(en.key, { mainAccountId: e.target.value })} className="min-w-[160px]">
                            <option value="">Select account…</option>
                            {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </Select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" min={0} step="0.01" value={en.debit ? String(en.debit) : ''} onChange={(e) => updateEntry(en.key, { debit: Number(e.target.value) || 0, credit: 0 })} className="text-right" placeholder="0" title="Debit — money in" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" min={0} step="0.01" value={en.credit ? String(en.credit) : ''} onChange={(e) => updateEntry(en.key, { credit: Number(e.target.value) || 0, debit: 0 })} className="text-right" placeholder="0" title="Credit — money out" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input value={en.narration ?? ''} onChange={(e) => updateEntry(en.key, { narration: e.target.value })} placeholder="optional" />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button type="button" onClick={() => removeEntry(en.key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                    {formEntries.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">Add at least two entries (one debit, one credit).</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-800">
                      <td className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(formTotalDebit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(formTotalCredit)}</td>
                      <td className="px-3 py-2 text-right text-xs" colSpan={2}>
                        <span className={formBalanced ? 'font-medium text-teal-600' : 'font-semibold text-red-600'}>
                          {formBalanced ? 'Balanced — ready to save' : `Off by ${money(Math.abs(formTotalDebit - formTotalCredit))} — amounts must match`}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addEntry} className="mt-2"><Plus className="h-4 w-4" /> Add entry</Button>
            </div>
          )}

          <p className="text-xs text-slate-400">
            {canPost ? 'Saving posts the entry straight to the cash book.' : 'Saved as a draft — post it from Vouchers to show it here.'}
          </p>

          {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createEntry.isPending} disabled={formMode === 'easy' ? !easyValid : !formBalanced}>
              <CheckCircle2 className="h-4 w-4" /> Save entry
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete voucher from cash book"
        message={
          `Delete voucher "${deleteTarget?.voucher?.number ?? ''}" (${deleteTarget?.reference ?? 'no reference'})? ` +
          `This reverses any linked receipt / payment, removes the entry from the ledger and cannot be undone.`
        }
        confirmLabel="Delete voucher"
        loading={remove.isPending}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={() => {
          const id = deleteTarget ? voucherIdOf(deleteTarget) : null;
          if (id) remove.mutate(id);
        }}
      >
        {deleteError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</div>
        )}
      </ConfirmDialog>
    </div>
  );
}

function VoucherDetailModal({
  open,
  loading,
  detail,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  detail: Voucher | null | undefined;
  onClose: () => void;
}) {
  const entries: VoucherEntry[] = detail?.entries ?? [];
  const tDebit = entries.reduce((s, en) => s + Number(en.debit ?? 0), 0);
  const tCredit = entries.reduce((s, en) => s + Number(en.credit ?? 0), 0);

  return (
    <Modal open={open} onClose={onClose} title={`Voucher ${detail?.number ?? ''}`} size="lg">
      {loading || !detail ? null : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <KV label="Date" value={new Date(detail.voucherDate).toLocaleDateString('en-GB')} />
            <KV label="Type" value={detail.voucherType} />
            <KV label="Reference" value={detail.reference ?? '—'} />
            <KV label="Status" value={detail.status} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2">Narration</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((en, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{en.mainAccount?.name ?? '-'} <span className="text-xs text-slate-400">({en.mainAccount?.code})</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{en.debit ? money(en.debit) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{en.credit ? money(en.credit) : ''}</td>
                    <td className="px-3 py-2 text-sm text-slate-500">{en.narration ?? ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tDebit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tCredit)}</td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!!detail.description && <p className="mt-3 text-xs text-slate-500">Description: {detail.description}</p>}
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
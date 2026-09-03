'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useAccountingAccounts } from '@/hooks/use-options';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { money } from '@/lib/utils';

type Row = Record<string, unknown>;

export default function GeneralLedgerPage() {
  const { options: accountOptions } = useAccountingAccounts();
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ rows: Row[]; total: number; openingBalance: number; closingBalance: number; account?: Row }>({
    queryKey: ['general-ledger', accountId, from, to, page],
    queryFn: () => apiFetch('/reports/general-ledger' + qs({ accountId, from: from || undefined, to: to || undefined, page, pageSize: 30 })),
    enabled: !!accountId,
  });

  return (
    <div>
      <PageHeader title="General Ledger" description="Account-wise posted voucher entries with running balance." />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Account" className="flex-1">
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }} required>
              <option value="">Select account…</option>
              {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
        </div>

        {!accountId && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Select an account to view its ledger.</div>
        )}

        {accountId && (
          <div className="overflow-x-auto">
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-600">Opening balance: <span className="font-semibold text-slate-800">{money(data?.openingBalance ?? 0, 'PKR')}</span></span>
              <span className="text-slate-600">Closing balance: <span className="font-semibold text-slate-800">{money(data?.closingBalance ?? 0, 'PKR')}</span></span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Voucher</th>
                  <th className="px-4 py-2">Description / Narration</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600">{r.date ? new Date(String(r.date)).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-4 py-2 font-mono font-semibold text-slate-800">{String(r.voucherNumber ?? '')}</td>
                    <td className="max-w-[300px] truncate px-4 py-2 text-slate-600">{String(r.description ?? '')}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-teal-600">{r.debit ? money(r.debit, 'PKR') : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.credit ? money(r.credit, 'PKR') : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.balance, 'PKR')}</td>
                  </tr>
                ))}
                {(!data || data.rows.length === 0) && !isLoading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
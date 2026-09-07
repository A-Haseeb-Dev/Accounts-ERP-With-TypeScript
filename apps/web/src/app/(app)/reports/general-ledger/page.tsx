'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useAccountingAccounts } from '@/hooks/use-options';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { ColumnPicker, useReportColumns, type ColumnDef } from '@/components/report-columns';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { LedgerRow, MainAccount } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'voucher', header: 'Voucher' },
  { key: 'description', header: 'Description / Narration' },
  { key: 'debit', header: 'Debit' },
  { key: 'credit', header: 'Credit' },
  { key: 'balance', header: 'Balance' },
];

export default function GeneralLedgerPage() {
  const { options: accountOptions } = useAccountingAccounts();
  const cols = useReportColumns(COLUMNS, 'general-ledger');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<{ rows: LedgerRow[]; total: number; openingBalance: number; closingBalance: number; account?: MainAccount }>({
    queryKey: ['general-ledger', accountId, from, to, page],
    queryFn: () => apiFetch('/reports/general-ledger' + qs({ accountId, from: from || undefined, to: to || undefined, page, pageSize: 30 })),
    enabled: !!accountId,
  });

  return (
    <div>
      <PageHeader
        title="General Ledger"
        description="Account-wise posted voucher entries with running balance."
        actions={
          <ReportActions
            tableId="gl-report"
            filename="general-ledger"
            title={`General Ledger — ${data?.account?.name ?? ''} ${from ? `(${from} to ${to || from})` : ''}`}
            disabled={!accountId || isLoading}
          />
        }
      />

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
          <div className="ml-auto">
            <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
          </div>
        </div>

        {!accountId && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Select an account to view its ledger.</div>
        )}

        {accountId && (
          <>
            {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}
            <div id="gl-report" className="overflow-x-auto">
            <ReportPrintHeader title="General Ledger" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-700">
                <span className="font-semibold text-slate-900">General Ledger</span>
                {data?.account?.name && <span className="text-slate-500"> — {data.account.name}</span>}
              </span>
              <span className="text-slate-500">
                {from ? `Period: ${from}${to ? ` to ${to}` : ''}` : 'All dates'}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-600">Opening balance: <span className="font-semibold text-slate-800">{money(data?.openingBalance ?? 0, 'PKR')}</span></span>
              <span className="text-slate-600">Closing balance: <span className="font-semibold text-slate-800">{money(data?.closingBalance ?? 0, 'PKR')}</span></span>
            </div>
            {isLoading ? (
              <TableSkeleton rows={6} columns={COLUMNS.length} />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  {cols.defsFiltered.map((c) => (
                    <th key={c.key} className={`px-4 py-2 ${c.key === 'debit' || c.key === 'credit' || c.key === 'balance' ? 'text-right' : ''}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r, i) => (
                  <tr key={r.id ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    {cols.isVisible('date') && <td className="px-4 py-2 text-slate-600">{r.date ? new Date(r.date).toLocaleDateString('en-GB') : '—'}</td>}
                    {cols.isVisible('voucher') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.voucherNumber ?? ''}</td>}
                    {cols.isVisible('description') && <td className="max-w-[300px] truncate px-4 py-2 text-slate-600">{r.description ?? ''}</td>}
                    {cols.isVisible('debit') && <td className="px-4 py-2 text-right tabular-nums text-teal-600">{r.debit ? money(r.debit, 'PKR') : ''}</td>}
                    {cols.isVisible('credit') && <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.credit ? money(r.credit, 'PKR') : ''}</td>}
                    {cols.isVisible('balance') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.balance, 'PKR')}</td>}
                  </tr>
                ))}
                {(!data || data.rows.length === 0) && !isLoading && (
                  <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
                )}
              </tbody>
            </table>
            )}
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
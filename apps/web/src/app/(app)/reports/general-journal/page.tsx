'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { Voucher } from '@/lib/types';

export default function GeneralJournalPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<{ vouchers: Voucher[]; total: number }>({
    queryKey: ['general-journal', from, to, page],
    queryFn: () => apiFetch('/reports/general-journal' + qs({ from: from || undefined, to: to || undefined, page, pageSize: 30 })),
  });

  const vouchers = data?.vouchers ?? [];

  return (
    <div>
      <PageHeader
        title="General Journal"
        description="All posted vouchers in chronological order."
        actions={
          <ReportActions
            tableId="gj-report"
            filename="general-journal"
            title={`General Journal ${from ? `(${from} to ${to || from})` : ''}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        <div id="gj-report" className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={7} columns={6} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2">Narration</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.flatMap((voucher) =>
                voucher.entries.map((entry, j) => (
                  <tr key={`${voucher.id}-${j}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    {j === 0 && <td rowSpan={Math.max(voucher.entries.length, 1)} className="px-4 py-2 text-slate-600">{new Date(voucher.voucherDate).toLocaleDateString('en-GB')}</td>}
                    {j === 0 && <td rowSpan={Math.max(voucher.entries.length, 1)} className="px-4 py-2 font-mono font-semibold text-slate-800">{voucher.number}</td>}
                    <td className="px-4 py-2 text-slate-700">{entry.mainAccount?.name ?? entry.mainAccountId}</td>
                    <td className="max-w-[250px] truncate px-4 py-2 text-slate-600">{entry.narration ?? voucher.description ?? ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-teal-600">{entry.debit ? money(entry.debit, 'PKR') : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{entry.credit ? money(entry.credit, 'PKR') : ''}</td>
                  </tr>
                ))
              )}
              {(vouchers.length === 0) && !isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>

        {vouchers.length > 0 && (
          <div className="flex justify-end border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            Showing {vouchers.length} of {data?.total} vouchers
          </div>
        )}
      </Card>
    </div>
  );
}
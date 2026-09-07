'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { ColumnPicker, useReportColumns, type ColumnDef } from '@/components/report-columns';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { Voucher } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'number', header: 'Number' },
  { key: 'account', header: 'Account' },
  { key: 'narration', header: 'Narration' },
  { key: 'debit', header: 'Debit' },
  { key: 'credit', header: 'Credit' },
];

export default function GeneralJournalPage() {
  const cols = useReportColumns(COLUMNS, 'general-journal');
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
          <div className="ml-auto">
            <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
          </div>
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        <div id="gj-report" className="overflow-x-auto">
          <ReportPrintHeader title="General Journal" />
          {isLoading ? (
            <TableSkeleton rows={7} columns={COLUMNS.length} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                {cols.defsFiltered.map((c) => (
                  <th key={c.key} className={`px-4 py-2 ${c.key === 'debit' || c.key === 'credit' ? 'text-right' : ''}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vouchers.flatMap((voucher) =>
                voucher.entries.map((entry, j) => (
                  <tr key={`${voucher.id}-${j}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    {j === 0 && cols.isVisible('date') && <td rowSpan={Math.max(voucher.entries.length, 1)} className="px-4 py-2 text-slate-600">{new Date(voucher.voucherDate).toLocaleDateString('en-GB')}</td>}
                    {j === 0 && cols.isVisible('number') && <td rowSpan={Math.max(voucher.entries.length, 1)} className="px-4 py-2 font-mono font-semibold text-slate-800">{voucher.number}</td>}
                    {cols.isVisible('account') && <td className="px-4 py-2 text-slate-700">{entry.mainAccount?.name ?? entry.mainAccountId}</td>}
                    {cols.isVisible('narration') && <td className="max-w-[250px] truncate px-4 py-2 text-slate-600">{entry.narration ?? voucher.description ?? ''}</td>}
                    {cols.isVisible('debit') && <td className="px-4 py-2 text-right tabular-nums text-teal-600">{entry.debit ? money(entry.debit, 'PKR') : ''}</td>}
                    {cols.isVisible('credit') && <td className="px-4 py-2 text-right tabular-nums text-red-600">{entry.credit ? money(entry.credit, 'PKR') : ''}</td>}
                  </tr>
                ))
              )}
              {(vouchers.length === 0) && !isLoading && (
                <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
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
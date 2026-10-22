'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';

type PLRow = {
  accountId: string;
  code: string;
  name: string;
  head: string | null;
  subHead: string | null;
  amount: number;
};

type ProfitLoss = {
  from: string | null;
  to: string | null;
  revenue: PLRow[];
  expenses: PLRow[];
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
  margin: number;
};

export default function ProfitLossPage() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);

  const { data, isLoading, isError, error, refetch } = useQuery<ProfitLoss>({
    queryKey: ['profit-loss', from, to],
    queryFn: () =>
      apiFetch('/reports/profit-loss' + qs({ from: from || undefined, to: to || undefined })),
  });

  const revenue = data?.revenue ?? [];
  const expenses = data?.expenses ?? [];
  const title = `Profit & Loss${from ? ` (${from} to ${to || from})` : ''}`;

  const renderRows = (rows: PLRow[]) => (
    <>
      {rows.map((r) => (
        <tr key={r.accountId} className="border-b border-slate-100 hover:bg-slate-50">
          <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.code}</td>
          <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
          <td className="px-4 py-2 text-slate-600">{r.subHead ?? r.head ?? '—'}</td>
          <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">
            {money(r.amount)}
          </td>
        </tr>
      ))}
      {rows.length === 0 && (
        <tr>
          <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
            Nothing posted in this period.
          </td>
        </tr>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        description="Revenue earned against expenses incurred for a period. Reads the same posted entries as the trial balance, so it always reconciles."
        actions={<ReportActions tableId="profit-loss" filename="profit-loss" title={title} />}
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </Field>
        </div>

        {isError && (
          <div className="border-b border-slate-100 px-4 py-3">
            <QueryError error={error} onRetry={() => refetch()} />
          </div>
        )}

        <div id="profit-loss" className="overflow-x-auto">
          <ReportPrintHeader title={title} />

          {isLoading ? (
            <TableSkeleton rows={8} columns={4} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Group</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50/70">
                  <td colSpan={4} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Revenue
                  </td>
                </tr>
                {renderRows(revenue)}
                <tr className="border-y border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right text-slate-600">
                    Total Revenue
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-700">
                    {money(data?.totalRevenue ?? 0)}
                  </td>
                </tr>

                <tr className="bg-slate-50/70">
                  <td colSpan={4} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Expenses
                  </td>
                </tr>
                {renderRows(expenses)}
                <tr className="border-y border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right text-slate-600">
                    Total Expenses
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600">
                    {money(data?.totalExpense ?? 0)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 text-base font-bold">
                  <td colSpan={3} className="px-4 py-3 text-right">
                    {data && data.netProfit < 0 ? 'Net Loss' : 'Net Profit'}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      (data?.netProfit ?? 0) < 0 ? 'text-red-700' : 'text-teal-700'
                    }`}
                  >
                    {money(data?.netProfit ?? 0)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-xs text-slate-500">
                    Margin: {(data?.margin ?? 0).toFixed(2)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

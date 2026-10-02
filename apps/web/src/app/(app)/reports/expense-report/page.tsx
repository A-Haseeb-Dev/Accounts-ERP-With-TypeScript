'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';

type Chart = {
  id: string;
  name: string;
  subHeads: { id: string; code: string; name: string; mainAccounts: { id: string; accountType: string }[] }[];
};

/** Sub-heads that actually hold an expense account, read from the live chart. */
function useExpenseHeads() {
  const { data } = useQuery<Chart[]>({
    queryKey: ['account-list'],
    queryFn: () => apiFetch('/reports/account-list'),
    staleTime: 5 * 60_000,
  });

  return (data ?? [])
    .flatMap((head) => head.subHeads.map((sh) => ({ ...sh, headName: head.name })))
    .filter((sh) => sh.mainAccounts.some((a) => a.accountType === 'EXPENSE'));
}

type ExpenseRow = {
  accountId: string;
  code: string;
  name: string;
  subHeadId: string | null;
  subHeadName: string;
  headName: string;
  debit: number;
  credit: number;
  net: number;
};

type ExpenseReport = { from: string | null; to: string | null; rows: ExpenseRow[]; total: number };

export default function ExpenseReportPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subHeadId, setSubHeadId] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery<ExpenseReport>({
    queryKey: ['expense-report', from, to, subHeadId],
    queryFn: () =>
      apiFetch('/reports/expense-report' + qs({ from: from || undefined, to: to || undefined, subHeadId: subHeadId || undefined })),
  });

  const rows = data?.rows ?? [];
  const expenseHeads = useExpenseHeads();

  return (
    <div>
      <PageHeader
        title="Expense Report"
        description="Where the money went, grouped by expense account. Reads the same posted entries as the trial balance, so it always reconciles."
        actions={
          <ReportActions
            tableId="expense-report"
            filename="expense-report"
            title={`Expense Report${from ? ` (${from} to ${to || from})` : ''}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </Field>
          <Field label="Sub-head">
            <Select value={subHeadId} onChange={(e) => setSubHeadId(e.target.value)} className="w-56">
              <option value="">All expense heads</option>
              {expenseHeads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.headName} › {s.code} {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {isError && (
          <div className="border-b border-slate-100 px-4 py-3">
            <QueryError error={error} onRetry={() => refetch()} />
          </div>
        )}

        <div id="expense-report" className="overflow-x-auto">
          <ReportPrintHeader title={`Expense Report${from ? ` (${from} to ${to || from})` : ''}`} />

          {isLoading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Expense Account</th>
                  <th className="px-4 py-2">Sub-head</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.accountId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.code}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-2 text-slate-600">{r.subHeadName}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-teal-600">{r.debit ? money(r.debit) : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.credit ? money(r.credit) : ''}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">{money(r.net)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No expenses posted in this period.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td colSpan={3} className="px-4 py-2 text-xs uppercase text-slate-500">
                      Total expenses
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {money(rows.reduce((s, r) => s + r.debit, 0))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {money(rows.reduce((s, r) => s + r.credit, 0))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">{money(data?.total ?? 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

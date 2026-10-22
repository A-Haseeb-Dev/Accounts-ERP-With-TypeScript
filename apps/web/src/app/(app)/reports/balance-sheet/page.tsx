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
import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/utils';

type BSRow = {
  accountId: string;
  code: string;
  name: string;
  head: string | null;
  subHead: string | null;
  amount: number;
};

type BalanceSheet = {
  asOf: string | null;
  assets: BSRow[];
  liabilities: BSRow[];
  equity: BSRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  profitForPeriod: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
};

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, isError, error, refetch } = useQuery<BalanceSheet>({
    queryKey: ['balance-sheet', asOf],
    queryFn: () => apiFetch('/reports/balance-sheet' + qs({ asOf: asOf || undefined })),
  });

  const title = `Balance Sheet${asOf ? ` (as of ${asOf})` : ''}`;

  const Section = ({
    name,
    rows,
    total,
    tone,
  }: {
    name: string;
    rows: BSRow[];
    total: number;
    tone: string;
  }) => (
    <>
      <tr className="bg-slate-50/70">
        <td colSpan={3} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          {name}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.accountId} className="border-b border-slate-100 hover:bg-slate-50">
          <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.code}</td>
          <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
          <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">
            {money(r.amount)}
          </td>
        </tr>
      ))}
      {rows.length === 0 && (
        <tr>
          <td colSpan={3} className="px-4 py-4 text-center text-slate-400">
            No balances.
          </td>
        </tr>
      )}
      <tr className="border-y border-slate-200 bg-slate-50 font-semibold">
        <td colSpan={2} className="px-4 py-2 text-right text-slate-600">
          Total {name}
        </td>
        <td className={`px-4 py-2 text-right tabular-nums ${tone}`}>{money(total)}</td>
      </tr>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Balance Sheet"
        description="What the business owns and owes at a point in time. Unclosed profit is shown as its own equity line so the sheet balances."
        actions={<ReportActions tableId="balance-sheet" filename="balance-sheet" title={title} />}
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="As of">
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
          </Field>
          {data && (
            <Badge tone={data.balanced ? 'green' : 'red'}>
              {data.balanced ? 'Balanced' : 'Out of balance'}
            </Badge>
          )}
        </div>

        {isError && (
          <div className="border-b border-slate-100 px-4 py-3">
            <QueryError error={error} onRetry={() => refetch()} />
          </div>
        )}

        <div id="balance-sheet" className="overflow-x-auto">
          <ReportPrintHeader title={title} />

          {isLoading ? (
            <TableSkeleton rows={10} columns={3} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <Section name="Assets" rows={data?.assets ?? []} total={data?.totalAssets ?? 0} tone="text-teal-700" />
                <Section
                  name="Liabilities"
                  rows={data?.liabilities ?? []}
                  total={data?.totalLiabilities ?? 0}
                  tone="text-red-600"
                />
                <Section name="Equity" rows={data?.equity ?? []} total={data?.totalEquity ?? 0} tone="text-slate-800" />
                {(data?.profitForPeriod ?? 0) !== 0 && (
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">â€”</td>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      Profit for the period (not yet closed)
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">
                      {money(data?.profitForPeriod ?? 0)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 text-base font-bold">
                  <td colSpan={2} className="px-4 py-3 text-right">
                    Total Liabilities &amp; Equity
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                    {money(data?.totalLiabilitiesAndEquity ?? 0)}
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


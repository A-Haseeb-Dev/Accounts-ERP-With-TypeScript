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

type DaySummary = {
  date: string;
  sales: { count: number; total: number };
  salesReturns: { count: number; total: number };
  purchases: { count: number; total: number };
  purchaseReturns: { count: number; total: number };
  receipts: { count: number; total: number };
  payments: { count: number; total: number };
  expenses: number;
  netSales: number;
  netPurchases: number;
  cashIn: number;
  cashOut: number;
  closingCash: number;
  cashAccount: { code: string; name: string } | null;
};

type DayBookEntry = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  narration: string | null;
};

type DayBookVoucher = {
  id: string;
  number: string;
  voucherType: string;
  voucherDate: string;
  description: string | null;
  reference: string | null;
  entries: DayBookEntry[];
  totalDebit: number;
  totalCredit: number;
};

type DayReport = { date: string; summary: DaySummary; total: number; page: number; pageSize: number; vouchers: DayBookVoucher[] };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DayReportPage() {
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<DayReport>({
    queryKey: ['day-report', date, page],
    queryFn: () => apiFetch('/reports/day-report' + qs({ date, page, pageSize: 30 })),
  });

  const s = data?.summary;
  const vouchers = data?.vouchers ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Day Report"
        description="What the day looked like: summary on top, every posting underneath."
        actions={
          <ReportActions tableId="day-report" filename="day-report" title={`Day Report ${date}`} />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="w-44"
            />
          </Field>
        </div>

        {isError && (
          <div className="border-b border-slate-100 px-4 py-3">
            <QueryError onRetry={() => refetch()} />
          </div>
        )}

        <div id="day-report">
          <ReportPrintHeader title="Day Report" />

          {/* Summary first: the numbers a shop owner wants before any detail. */}
          <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Net Sales" value={s?.netSales} sub={s ? `${s.sales.count} invoice(s)${s.salesReturns.count ? ` · ${s.salesReturns.count} return(s)` : ''}` : undefined} tone="in" />
            <Stat label="Net Purchases" value={s?.netPurchases} sub={s ? `${s.purchases.count} bill(s)${s.purchaseReturns.count ? ` · ${s.purchaseReturns.count} return(s)` : ''}` : undefined} tone="out" />
            <Stat label="Receipts" value={s?.receipts.total} sub={s ? `${s.receipts.count} receipt(s)` : undefined} tone="in" />
            <Stat label="Payments" value={s?.payments.total} sub={s ? `${s.payments.count} payment(s)` : undefined} tone="out" />
            <Stat label="Expenses" value={s?.expenses} tone="out" />
            <Stat label="Cash In" value={s?.cashIn} tone="in" />
            <Stat label="Cash Out" value={s?.cashOut} tone="out" />
            <Stat
              label="Closing Cash"
              value={s?.closingCash}
              sub={s?.cashAccount?.name}
              tone={undefined}
            />
          </div>

          {!s?.cashAccount && !isLoading && (
            <p className="border-b border-slate-100 px-4 py-2 text-xs text-amber-700">
              Set a Cash account in Settings &rsaquo; Accounting to see the closing cash balance.
            </p>
          )}

          {isLoading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2">Voucher</th>
                    <th className="px-4 py-2">Code</th>
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
                        {j === 0 && (
                          <td rowSpan={Math.max(voucher.entries.length, 1)} className="px-4 py-2 font-mono text-xs font-semibold text-slate-800">
                            {voucher.number}
                          </td>
                        )}
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{entry.accountCode}</td>
                        <td className="px-4 py-2 text-slate-700">{entry.accountName}</td>
                        <td className="max-w-[250px] truncate px-4 py-2 text-slate-600">
                          {entry.narration ?? voucher.description ?? ''}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-teal-600">{entry.debit ? money(entry.debit) : ''}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-600">{entry.credit ? money(entry.credit) : ''}</td>
                      </tr>
                    )),
                  )}
                  {vouchers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No postings on this date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            <span>
              {data ? `Showing ${vouchers.length} of ${data.total} voucher(s) · page ${data.page} of ${totalPages}` : ''}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-slate-200 px-3 py-1 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-slate-200 px-3 py-1 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value?: number;
  sub?: string;
  tone?: 'in' | 'out';
}) {
  const color =
    tone === 'in' ? 'text-teal-600' : tone === 'out' ? 'text-red-600' : 'text-slate-800';
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value === undefined ? '—' : money(value)}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

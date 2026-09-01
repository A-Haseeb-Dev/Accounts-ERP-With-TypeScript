'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { money } from '@/lib/utils';

type Row = Record<string, unknown>;

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, refetch } = useQuery<Row[]>({
    queryKey: ['trial-balance', asOf],
    queryFn: () => apiFetch('/reports/trial-balance' + (asOf ? `?asOf=${asOf}` : '')),
  });

  const totalDebit = (data ?? []).reduce((s, r) => s + Number(r.debitBalance ?? 0), 0);
  const totalCredit = (data ?? []).reduce((s, r) => s + Number(r.creditBalance ?? 0), 0);

  return (
    <div>
      <PageHeader title="Trial Balance" description="All account balances as of a date." />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="As of date">
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
          </Field>
          <Button variant="secondary" onClick={() => refetch()} disabled={isLoading}>Refresh</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2">Head</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
                <th className="px-4 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => {
                const net = Number(r.debitBalance ?? 0) - Number(r.creditBalance ?? 0);
                return (
                  <tr key={String(r.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-800">{String(r.code)}</td>
                    <td className="px-4 py-2 text-slate-700">{String(r.name)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{String((r.headAccount as Row)?.name ?? '')}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{Number(r.debitBalance) ? money(r.debitBalance, 'PKR') : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{Number(r.creditBalance) ? money(r.creditBalance, 'PKR') : ''}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${net >= 0 ? 'text-teal-600' : 'text-red-600'}`}>{money(net, 'PKR')}</td>
                  </tr>
                );
              })}
              {(!data || data.length === 0) && !isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No data.</td></tr>
              )}
            </tbody>
            {data && data.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={3} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalDebit, 'PKR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalCredit, 'PKR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalDebit - totalCredit, 'PKR')}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
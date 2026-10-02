'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';

type PartyOption = { id: string; code: string; name: string };

type Line = {
  kind: 'invoice' | 'bill' | 'credit-note' | 'debit-note' | 'receipt' | 'payment';
  date: string;
  number: string;
  reference: string | null;
  narration: string | null;
  dueDate: string | null;
  debit: number;
  credit: number;
  balance: number;
};

type Statement = {
  partyType: 'CUSTOMER' | 'SUPPLIER';
  party: { id: string; code: string; name: string; creditDays: number | null };
  from: string | null;
  to: string;
  opening: number;
  rows: Line[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
  balanceType: 'DR' | 'CR' | null;
};

const KIND_LABEL: Record<Line['kind'], string> = {
  invoice: 'Invoice',
  bill: 'Bill',
  'credit-note': 'Credit Note',
  'debit-note': 'Debit Note',
  receipt: 'Receipt',
  payment: 'Payment',
};

export default function PartyStatementPage() {
  const [partyType, setPartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [partyId, setPartyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const listPath = partyType === 'SUPPLIER' ? '/suppliers/flat' : '/customers/flat';
  const { data: parties } = useQuery<PartyOption[]>({
    queryKey: ['party-options', partyType],
    queryFn: () => apiFetch(listPath),
    enabled: !!partyId || true,
  });

  const selected = useMemo(() => parties?.find((p) => p.id === partyId), [parties, partyId]);

  const { data, isLoading, isError, refetch } = useQuery<Statement>({
    queryKey: ['party-statement', partyType, partyId, from, to],
    queryFn: () =>
      apiFetch('/reports/party-statement' + qs({ partyType, partyId, from: from || undefined, to: to || undefined })),
    enabled: !!partyId,
  });

  const label = partyType === 'SUPPLIER' ? 'Supplier' : 'Customer';
  const rows = data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Party Statement"
        description="Every document and payment for one party, with a running balance."
        actions={
          data ? (
            <ReportActions
              tableId="party-statement"
              filename="party-statement"
              title={`${label} Statement — ${data.party.name}${data.from ? ` (${data.from} to ${data.to})` : ` up to ${data.to}`}`}
            />
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Party">
            <div className="flex rounded border border-slate-200">
              {(['CUSTOMER', 'SUPPLIER'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setPartyType(t);
                    setPartyId('');
                  }}
                  className={`px-3 py-2 text-xs font-medium ${partyType === t ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                >
                  {t === 'CUSTOMER' ? 'Customers' : 'Suppliers'}
                </button>
              ))}
            </div>
          </Field>
          <Field label={label}>
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="w-64">
              <option value="">Select a {label.toLowerCase()}…</option>
              {(parties ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From (optional)">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </Field>
        </div>

        {isError && (
          <div className="border-b border-slate-100 px-4 py-3">
            <QueryError onRetry={() => refetch()} />
          </div>
        )}

        {!partyId ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            Pick a {label.toLowerCase()} to see the statement.
          </p>
        ) : isLoading ? (
          <div className="px-4 py-4">
            <TableSkeleton rows={8} columns={6} />
          </div>
        ) : (
          <div id="party-statement" className="overflow-x-auto">
            <ReportPrintHeader
              title={`${label} Statement — ${data?.party.name}${data?.from ? ` (${data.from} to ${data.to})` : ` up to ${data?.to}`}`}
            />

            <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
              <div className="bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase text-slate-500">Opening</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-slate-800">{money(data?.opening ?? 0)}</div>
              </div>
              <div className="bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase text-slate-500">Debit</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-teal-600">{money(data?.totalDebit ?? 0)}</div>
              </div>
              <div className="bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase text-slate-500">Credit</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-red-600">{money(data?.totalCredit ?? 0)}</div>
              </div>
              <div className="bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  Closing {data?.balanceType ?? ''}
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{money(data?.closing ?? 0)}</div>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Number</th>
                  <th className="px-4 py-2">Narration</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                    Opening balance
                  </td>
                  <td colSpan={3} className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {money(data?.opening ?? 0)}
                  </td>
                </tr>
                {rows.map((l, i) => (
                  <tr key={`${l.number}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600">{new Date(l.date).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-2 text-slate-600">{KIND_LABEL[l.kind]}</td>
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-800">{l.number}</td>
                    <td className="max-w-[280px] truncate px-4 py-2 text-slate-600">
                      {l.narration ?? l.reference ?? ''}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-teal-600">{l.debit ? money(l.debit) : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{l.credit ? money(l.credit) : ''}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-800">{money(l.balance)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No transactions in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {selected.code} — {selected.name}
            {data?.party.creditDays != null && ` · ${data.party.creditDays} day credit period`}
          </div>
        )}
      </Card>
    </div>
  );
}

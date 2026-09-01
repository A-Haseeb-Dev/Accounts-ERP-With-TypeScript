'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Input } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { money } from '@/lib/utils';

type Row = Record<string, unknown>;

export default function CashBookPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: Row[]; total: number; totalRunning: number }>({
    queryKey: ['cashbook', page, from, to, search],
    queryFn: () => apiFetch('/vouchers/cash-book' + qs({ page, pageSize: 20, from: from || undefined, to: to || undefined, search: search || undefined })),
  });

  return (
    <div>
      <PageHeader title="Cash Book" description="Chronological cash account activity and running balance." />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
          <span className="text-sm text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search voucher…" className="max-w-xs" />
        </div>

        <DataTable<Row>
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(String(r.date ?? r.voucherDate)).toLocaleDateString('en-GB')}</span> },
            { key: 'voucher', header: 'Voucher', render: (r) => {
              const v = (r.voucher as Row | null) ?? r;
              return <span className="font-mono font-semibold text-slate-800">{String(v.number ?? '')}</span>;
            } },
            { key: 'reference', header: 'Reference', render: (r) => <span className="text-slate-600">{r.reference ? String(r.reference) : '—'}</span> },
            { key: 'description', header: 'Description', render: (r) => <span className="text-slate-600">{(r.description as string) ?? '—'}</span> },
            { key: 'debit', header: 'Receipts', align: 'right', render: (r) => <span className="tabular-nums text-teal-600">{r.debit ? money(r.debit, 'PKR') : ''}</span> },
            { key: 'credit', header: 'Payments', align: 'right', render: (r) => <span className="tabular-nums text-red-600">{r.credit ? money(r.credit, 'PKR') : ''}</span> },
            { key: 'runningBalance', header: 'Balance', align: 'right', render: (r) => <span className="font-medium tabular-nums text-slate-800">{money(r.runningBalance, 'PKR')}</span> },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => String(r.id ?? JSON.stringify(r))}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />

        <div className="flex justify-end border-t border-slate-100 px-4 py-3 text-sm">
          <span className="text-slate-500">Closing balance: </span>
          <span className="ml-1.5 font-semibold tabular-nums text-slate-800">{money(data?.totalRunning ?? 0, 'PKR')}</span>
        </div>
      </Card>
    </div>
  );
}
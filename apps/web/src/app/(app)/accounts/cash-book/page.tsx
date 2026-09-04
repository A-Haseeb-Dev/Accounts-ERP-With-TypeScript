'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { Input } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { money } from '@/lib/utils';
import type { CashBookRow, Paginated, Voucher, VoucherEntry } from '@/lib/types';

export default function CashBookPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<Paginated<CashBookRow> & { totalRunning?: number }>({
    queryKey: ['cashbook', page, from, to, search],
    queryFn: () => apiFetch('/vouchers/cash-book' + qs({ page, pageSize: 20, from: from || undefined, to: to || undefined, search: search || undefined })),
  });

  const voucherIdOf = (r: CashBookRow): string | null => {
    const v = r.voucher ?? r;
    return v.id ?? null;
  };

  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detail, isLoading: detailLoading } = useQuery<Voucher | null>({
    queryKey: ['voucher', detailId],
    queryFn: () => apiFetch(`/vouchers/${detailId}`),
    enabled: !!detailId,
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

        <DataTable<CashBookRow>
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(r.date ?? r.voucherDate).toLocaleDateString('en-GB')}</span> },
            { key: 'voucher', header: 'Voucher', render: (r) => {
              return <span className="font-mono font-semibold text-slate-800">{r.voucher?.number ?? ''}</span>;
            } },
            { key: 'reference', header: 'Reference', render: (r) => <span className="text-slate-600">{r.reference ?? '—'}</span> },
            { key: 'description', header: 'Description', render: (r) => <span className="text-slate-600">{r.description ?? '—'}</span> },
            { key: 'debit', header: 'Receipts', align: 'right', render: (r) => <span className="tabular-nums text-teal-600">{r.debit ? money(r.debit, 'PKR') : ''}</span> },
            { key: 'credit', header: 'Payments', align: 'right', render: (r) => <span className="tabular-nums text-red-600">{r.credit ? money(r.credit, 'PKR') : ''}</span> },
            { key: 'runningBalance', header: 'Balance', align: 'right', render: (r) => <span className="font-medium tabular-nums text-slate-800">{money(r.runningBalance, 'PKR')}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => { const id = voucherIdOf(r); if (id) setDetailId(id); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View voucher"><Eye className="h-4 w-4" /></button>
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id ?? JSON.stringify(r)}
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

      <VoucherDetailModal open={!!detailId} loading={detailLoading} detail={detail} onClose={() => setDetailId(null)} />
    </div>
  );
}

function VoucherDetailModal({
  open,
  loading,
  detail,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  detail: Voucher | null | undefined;
  onClose: () => void;
}) {
  const entries: VoucherEntry[] = detail?.entries ?? [];
  const tDebit = entries.reduce((s, en) => s + (en.debit ?? 0), 0);
  const tCredit = entries.reduce((s, en) => s + (en.credit ?? 0), 0);

  return (
    <Modal open={open} onClose={onClose} title={`Voucher ${detail?.number ?? ''}`} size="lg">
      {loading || !detail ? null : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <KV label="Date" value={new Date(detail.voucherDate).toLocaleDateString('en-GB')} />
            <KV label="Type" value={detail.voucherType} />
            <KV label="Reference" value={detail.reference ?? '—'} />
            <KV label="Status" value={detail.status} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2">Narration</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((en, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{en.mainAccount?.name ?? '-'} <span className="text-xs text-slate-400">({en.mainAccount?.code})</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{en.debit ? money(en.debit, 'PKR') : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{en.credit ? money(en.credit, 'PKR') : ''}</td>
                    <td className="px-3 py-2 text-sm text-slate-500">{en.narration ?? ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tDebit, 'PKR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tCredit, 'PKR')}</td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!!detail.description && <p className="mt-3 text-xs text-slate-500">Description: {detail.description}</p>}
        </div>
      )}
    </Modal>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
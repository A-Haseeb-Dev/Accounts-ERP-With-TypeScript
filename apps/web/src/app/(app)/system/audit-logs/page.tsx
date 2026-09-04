'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input, Select } from '@/components/ui/field';
import { DataTable, type Column } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { dateTime } from '@/lib/utils';
import type { AuditEntry, Paginated } from '@/lib/types';

const ACTION_OPTIONS = ['CREATE', 'UPDATE', 'DELETE', 'POST', 'CANCEL', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT'];

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<Paginated<AuditEntry>>({
    queryKey: ['audit-logs', page, module, action, search, from, to],
    queryFn: () =>
      apiFetch(
        '/system/audit-logs' +
          qs({ page, pageSize: 30, module: module || undefined, action: action || undefined, search: search || undefined, from: from || undefined, to: to || undefined }),
      ),
  });

  const items = data?.items ?? [];
  const modules = useMemo(() => Array.from(new Set(items.map((r) => r.module).filter(Boolean))).sort(), [items]);

  const exportCsv = () => {
    const header = ['Date', 'Module', 'Action', 'Entity', 'Entity ID', 'User', 'Message', 'Metadata'];
    const rows = items.map((r) => [
      dateTime(r.createdAt),
      r.module,
      r.action,
      r.entity ?? '',
      r.entityId ?? '',
      r.user?.fullName ?? r.user?.username ?? '',
      r.message ?? '',
      r.metadata ? JSON.stringify(r.metadata) : '',
    ]);
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<AuditEntry>[] = [
    { key: 'createdAt', header: 'Date', render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{dateTime(r.createdAt)}</span> },
    { key: 'module', header: 'Module', render: (r) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{r.module}</span> },
    {
      key: 'action',
      header: 'Action',
      render: (r) => {
        const tones: Record<string, string> = {
          CREATE: 'bg-teal-50 text-teal-700',
          UPDATE: 'bg-blue-50 text-blue-700',
          DELETE: 'bg-red-50 text-red-700',
          POST: 'bg-emerald-50 text-emerald-700',
          CANCEL: 'bg-amber-50 text-amber-700',
          LOGIN: 'bg-indigo-50 text-indigo-700',
        };
        return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tones[r.action] ?? 'bg-slate-100 text-slate-600'}`}>{r.action}</span>;
      },
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (r) =>
        r.entity ? (
          <span className="text-slate-700">
            {r.entity}
            {r.entityId && <span className="ml-1 font-mono text-xs text-slate-400">{r.entityId.slice(0, 8)}</span>}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: 'user', header: 'User', render: (r) => <span className="text-slate-700">{r.user?.fullName ?? r.user?.username ?? 'System'}</span> },
    {
      key: 'message',
      header: 'Details',
      render: (r) => <span className="block max-w-[280px] truncate text-xs text-slate-500">{r.message ?? '—'}</span>,
    },
    { key: 'actions', header: '', className: 'w-12', render: (r) => (
      <button onClick={() => setSelected(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700" title="View details">
        <Eye className="h-4 w-4" />
      </button>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Full audit trail of every action performed in the system."
        actions={
          <Button variant="outline" size="md" onClick={exportCsv} disabled={items.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Search" className="w-64"><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search message…" /></Field>
          <Field label="Module">
            <Select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} className="w-44">
              <option value="">All modules</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Action">
            <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-40">
              <option value="">All actions</option>
              {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        <DataTable<AuditEntry>
          columns={columns}
          data={items}
          loading={isLoading}
          rowKey={(r) => r.id}
          page={page}
          pageSize={30}
          total={data?.total}
          onPageChange={setPage}
          emptyTitle="No audit events"
          emptyMessage="Actions you perform will be listed here."
        />
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Audit Event" size="lg">
        {selected && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{selected.module}</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{selected.action}</span>
              {selected.entity && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">{selected.entity}</span>}
            </div>

            {selected.message && <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{selected.message}</p>}

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div><dt className="text-xs text-slate-400">Date</dt><dd className="mt-0.5 text-slate-800">{dateTime(selected.createdAt)}</dd></div>
              <div><dt className="text-xs text-slate-400">User</dt><dd className="mt-0.5 text-slate-800">{selected.user?.fullName ?? selected.user?.username ?? 'System'}</dd></div>
              <div><dt className="text-xs text-slate-400">Entity ID</dt><dd className="mt-0.5 font-mono text-slate-800">{selected.entityId ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-400">IP Address</dt><dd className="mt-0.5 font-mono text-slate-800">{selected.ipAddress ?? '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-slate-400">User Agent</dt><dd className="mt-0.5 break-words text-slate-800">{selected.userAgent ?? '—'}</dd></div>
            </dl>

            {selected.metadata && Object.keys(selected.metadata).length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Metadata</div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-teal-300">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No metadata recorded for this event.</p>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="outline" size="md" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
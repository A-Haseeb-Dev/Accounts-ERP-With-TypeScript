'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { dateTime } from '@/lib/utils';

type Row = Record<string, unknown>;

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery<{ items: Row[]; total: number }>({
    queryKey: ['audit-logs', page, module, action],
    queryFn: () => apiFetch('/system/audit-logs' + qs({ page, pageSize: 30, module: module || undefined, action: action || undefined })),
  });

  return (
    <div>
      <PageHeader title="Audit Logs" description="System audit trail of all CRUD and posting actions." />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Input value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} placeholder="Module (e.g. PURCHASE)" className="w-48" />
          <Input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="Action (e.g. POST)" className="w-40" />
        </div>

        <DataTable<Row>
          columns={[
            { key: 'createdAt', header: 'Date', render: (r) => <span className="text-xs text-slate-600">{dateTime(r.createdAt)}</span> },
            { key: 'module', header: 'Module', render: (r) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{String(r.module)}</span> },
            { key: 'action', header: 'Action', render: (r) => <span className="text-xs font-semibold text-slate-700">{String(r.action)}</span> },
            { key: 'user', header: 'User', render: (r) => <span className="text-slate-700">{String((r.user as Row)?.fullName ?? (r.user as Row)?.username ?? '—')}</span> },
            { key: 'metadata', header: 'Details', render: (r) => <span className="max-w-[300px] truncate text-xs text-slate-500">{r.metadata ? JSON.stringify(r.metadata) : '—'}</span> },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => String(r.id)}
          page={page}
          pageSize={30}
          total={data?.total}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
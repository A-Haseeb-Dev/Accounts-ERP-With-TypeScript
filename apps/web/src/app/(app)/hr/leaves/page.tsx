'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Search, Trash2, X } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { useFlatOptions } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateOnly } from '@/lib/utils';
import { toast } from 'sonner';
import type { Column } from '@/components/data-table';
import type { HrLeaveRequest, LeaveBalance, Paginated } from '@/lib/types';

export default function LeavesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('hr.leaves.create');
  const canApprove = can('hr.leaves.approve');
  const canDelete = can('hr.leaves.delete');

  const { options: employeeOptions } = useFlatOptions('hr/employees');
  const { options: leaveTypeOptions } = useFlatOptions('hr/leave-types');

  const [tab, setTab] = useState<'requests' | 'balances'>('requests');

  const { data: balances } = useQuery<{ year: number; items: LeaveBalance[] }>({
    queryKey: ['hr/leaves', 'balances'],
    queryFn: () => apiFetch('/hr/leaves/balances'),
  });

  const balanceRows = useMemo(() => {
    const rows: {
      employeeId: string;
      code: string;
      employeeName: string;
      leaveTypeId: string;
      name: string;
      quota: number;
      used: number;
      remaining: number;
    }[] = [];
    for (const e of balances?.items ?? []) {
      for (const b of e.balances) {
        rows.push({ employeeId: e.employeeId, code: e.code, employeeName: e.employeeName, ...b });
      }
    }
    return rows;
  }, [balances]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrLeaveRequest | null>(null);

  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery<Paginated<HrLeaveRequest>>({
    queryKey: ['hr/leaves', page, status, search],
    queryFn: () =>
      apiFetch('/hr/leaves' + qs({ page, pageSize: 20, status: status || undefined, search: search || undefined })),
  });

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/hr/leaves', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/leaves'] });
      setModalOpen(false);
      setEmployeeId('');
      setLeaveTypeId('');
      setFromDate('');
      setToDate('');
      setReason('');
      toast.success('Leave request created');
    },
    onError: (e: Error) => {
      setFormError(e.message);
      toast.error(e.message || 'Failed to create request');
    },
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      apiFetch(`/hr/leaves/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ status: approve ? 'approved' : 'rejected' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/leaves'] });
      toast.success('Leave request updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/hr/leaves/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/leaves'] });
      setDeleteTarget(null);
      toast.success('Leave request deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Delete failed'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!fromDate || !toDate) {
      setFormError('Both dates are required');
      return;
    }
    createMutation.mutate({ employeeId, leaveTypeId, fromDate, toDate, reason: reason || undefined });
  };

  const columns: Column<HrLeaveRequest>[] = [
    {
      key: 'requestNo',
      header: 'Request No.',
      render: (r) => <span className="font-medium text-slate-700">{r.requestNo}</span>,
    },
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <span className="text-slate-800">
          {r.employee ? `${r.employee.code} · ${r.employee.fullName}` : '-'}
        </span>
      ),
    },
    {
      key: 'leaveType',
      header: 'Leave Type',
      render: (r) => (
        <span className="text-slate-600">{r.leaveType ? `${r.leaveType.name}${r.leaveType.paid ? '' : ' (unpaid)'}` : '-'}</span>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (r) => (
        <span className="text-xs text-slate-500">
          {dateOnly(r.fromDate)} → {dateOnly(r.toDate)} · {r.days} day{r.days === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-32',
      render: (r) => (
        <div className="flex items-center gap-1">
          {canApprove && r.status === 'pending' && (
            <>
              <button
                onClick={() => decideMutation.mutate({ id: r.id, approve: true })}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                title="Approve"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => decideMutation.mutate({ id: r.id, approve: false })}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                title="Reject"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
          {canDelete && r.status === 'pending' && (
            <button
              onClick={() => setDeleteTarget(r)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leaves"
        description="Applicable leave requests, ready to be approved or rejected."
        actions={
          canCreate && tab === 'requests' && (
            <Button onClick={() => { setFormError(''); setModalOpen(true); }}>
              <CalendarPlus className="h-4 w-4" /> New Request
            </Button>
          )
        }
      />

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
        {(['requests', 'balances'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t === 'requests' ? 'Requests' : 'Leave Balances'}
          </button>
        ))}
      </div>

      <Card>
        {tab === 'balances' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Employee</th>
                  <th className="px-4 py-2.5 font-medium">Leave Type</th>
                  <th className="px-4 py-2.5 font-medium">Quota</th>
                  <th className="px-4 py-2.5 font-medium">Used</th>
                  <th className="px-4 py-2.5 font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {balanceRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">No leave types / employees yet.</td>
                  </tr>
                )}
                {balanceRows.map((r) => (
                  <tr key={`${r.employeeId}-${r.leaveTypeId}`} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 text-slate-700">{r.code} · {r.employeeName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.quota}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.used}</td>
                    <td className={`px-4 py-2.5 font-semibold ${r.remaining > 0 ? 'text-teal-600' : 'text-red-500'}`}>{r.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search requests…"
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>

        <DataTable<HrLeaveRequest>
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
          emptyTitle="No leave requests yet"
          emptyMessage="Create a leave request to get started."
        />
        </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Leave Request" size="md">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Employee" required>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
              <option value="">Select employee…</option>
              {employeeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Leave Type" required>
            <Select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required>
              <option value="">Select leave type…</option>
              {leaveTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From" required>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>
            <Field label="To" required>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create Request</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete leave request"
        message={`Delete request ${deleteTarget?.requestNo}? Only pending requests can be deleted.`}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
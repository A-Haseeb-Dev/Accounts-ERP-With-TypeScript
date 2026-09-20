'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { CheckCircle2, Download, Eye, Plus, Printer, Send, Trash2, XCircle } from 'lucide-react';
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
import { dateOnly, money } from '@/lib/utils';
import { toast } from 'sonner';
import type { Column } from '@/components/data-table';
import type { Paginated, PayrollItem, PayrollRun } from '@/lib/types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function FragmentItem({
  item,
  itemColumns,
}: {
  item: PayrollItem;
  itemColumns: Column<PayrollItem>[];
}) {
  return (
    <Fragment>
      <tr className="border-b border-slate-50 last:border-0">
        {itemColumns.map((c) => (
          <td key={c.key} className="px-3 py-2.5">
            {c.render ? c.render(item) : String(item[c.key as keyof PayrollItem] ?? '')}
          </td>
        ))}
      </tr>
      {item.componentBreakdown && item.componentBreakdown.length > 0 && (
        <tr className="border-b border-slate-50 bg-slate-50/50 last:border-0">
          <td colSpan={itemColumns.length} className="px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              {item.componentBreakdown.map((b) => (
                <span key={b.name} className={b.type === 'EARNING' ? 'text-teal-700' : 'text-red-500'}>
                  {b.name} {money(b.amount)}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function PayrollPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('hr.payroll.create');
  const canUpdate = can('hr.payroll.update');
  const canPost = can('hr.payroll.post');
  const canCancel = can('hr.payroll.cancel');
  const canDelete = can('hr.payroll.delete');
  const canDisburse = can('hr.payroll.disburse');
  const canExport = can('hr.payroll.export');

  const { options: bankOptions } = useFlatOptions('banks');

  const year = new Date().getFullYear();
  const monthNow = new Date().getMonth() + 1;

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [genOpen, setGenOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [postTarget, setPostTarget] = useState<PayrollRun | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PayrollRun | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null);
  const [disburseTarget, setDisburseTarget] = useState<PayrollRun | null>(null);
  const [disburseBank, setDisburseBank] = useState('');
  const [printTargetId, setPrintTargetId] = useState<string | null>(null);

  const [genMonth, setGenMonth] = useState(monthNow);
  const [genYear, setGenYear] = useState(year);
  const [payDate, setPayDate] = useState('');
  const [note, setNote] = useState('');
  const [genError, setGenError] = useState('');

  const { data: runs, isLoading } = useQuery<Paginated<PayrollRun>>({
    queryKey: ['hr/payroll', page, status],
    queryFn: () => apiFetch('/hr/payroll' + qs({ page, pageSize: 20, status: status || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<PayrollRun | null>({
    queryKey: ['hr/payroll', 'detail', detailId],
    queryFn: () => apiFetch(`/hr/payroll/${detailId}`),
    enabled: !!detailId,
  });

  const { data: printData } = useQuery<PayrollRun | null>({
    queryKey: ['hr/payroll', 'detail', printTargetId],
    queryFn: () => apiFetch(`/hr/payroll/${printTargetId}`),
    enabled: !!printTargetId,
  });

  const exportMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch<{ filename: string; csv: string }>(`/hr/payroll/${id}/export`);
      if (!res?.csv) throw new Error('Empty bank file');
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? `Salary_${id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return res.filename;
    },
    onSuccess: (name) => toast.success(`Bank file ${name} downloaded`),
    onError: (e: Error) => toast.error(e.message || 'Export failed'),
  });

  const disburseMutation = useMutation({
    mutationFn: ({ id, bankAccountId }: { id: string; bankAccountId?: string }) =>
      apiFetch(`/hr/payroll/${id}/disburse`, { method: 'POST', body: JSON.stringify({ bankAccountId: bankAccountId || undefined }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/payroll'] });
      setDisburseTarget(null);
      setDisburseBank('');
      toast.success('Salaries disbursed');
    },
    onError: (e: Error) => toast.error(e.message || 'Disburse failed'),
  });

  const genMutation = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/hr/payroll', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/payroll'] });
      setGenOpen(false);
      toast.success('Payroll run generated');
    },
    onError: (e: Error) => {
      setGenError(e.message);
      toast.error(e.message || 'Generate failed');
    },
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/hr/payroll/${id}/post`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/payroll'] });
      setPostTarget(null);
      toast.success('Payroll posted to accounting');
    },
    onError: (e: Error) => toast.error(e.message || 'Post failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/hr/payroll/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/payroll'] });
      setCancelTarget(null);
      setCancelReason('');
      toast.success('Payroll run cancelled');
    },
    onError: (e: Error) => toast.error(e.message || 'Cancel failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/hr/payroll/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/payroll'] });
      setDeleteTarget(null);
      toast.success('Draft payroll deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Delete failed'),
  });

  const updateItemsMutation = useMutation({
    mutationFn: ({ id, items }: { id: string; items: { id: string; overtimeHours: number; otherDeduction: number }[] }) =>
      apiFetch(`/hr/payroll/${id}/items`, { method: 'PATCH', body: JSON.stringify({ items }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/payroll'] });
      toast.success('Payroll items updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const [edits, setEdits] = useState<Record<string, { overtimeHours: number; otherDeduction: number }>>({});

  const dirty = useMemo(() => {
    if (!detail?.items) return false;
    return detail.items.some((item) => {
      const e = edits[item.id];
      if (!e) return false;
      return e.overtimeHours !== Number(item.overtimeHours) || e.otherDeduction !== Number(item.otherDeduction);
    });
  }, [edits, detail]);

  const saveEdits = () => {
    if (!detail?.id) return;
    const items = Object.entries(edits).map(([id, e]) => ({ id, overtimeHours: e.overtimeHours, otherDeduction: e.otherDeduction }));
    updateItemsMutation.mutate({ id: detail.id, items });
  };

  const editFor = (item: PayrollItem) =>
    edits[item.id] ?? { overtimeHours: Number(item.overtimeHours), otherDeduction: Number(item.otherDeduction) };

  const setEdit = (id: string, key: 'overtimeHours' | 'otherDeduction', value: number) => {
    const target = detail?.items?.find((i) => i.id === id);
    if (!target) return;
    const base = edits[id] ?? { overtimeHours: Number(target.overtimeHours), otherDeduction: Number(target.otherDeduction) };
    setEdits((prev) => ({ ...prev, [id]: { ...base, [key]: value } }));
  };

  const columns: Column<PayrollRun>[] = [
    {
      key: 'number',
      header: 'Number',
      render: (r) => <span className="font-medium text-slate-700">{r.number}</span>,
    },
    {
      key: 'period',
      header: 'Period',
      render: (r) => <span className="text-slate-700">{r.periodLabel}</span>,
    },
    {
      key: 'employeeCount',
      header: 'Employees',
      render: (r) => <span className="text-slate-500">{r.employeeCount}</span>,
    },
    {
      key: 'net',
      header: 'Net Pay',
      render: (r) => <span className="text-slate-800 font-medium">{money(r.totalNet)}</span>,
    },
    {
      key: 'gross',
      header: 'Gross',
      render: (r) => <span className="text-xs text-slate-500">{money(r.totalGross)}</span>,
    },
    {
      key: 'voucher',
      header: 'Voucher',
      render: (r) => <span className="text-xs text-slate-500">{r.voucherNo ?? '-'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'w-44',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={() => setDetailId(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700" title="View">
            <Eye className="h-4 w-4" />
          </button>
          {canPost && r.status === 'draft' && (
            <button onClick={() => setPostTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-600" title="Post">
              <Send className="h-4 w-4" />
            </button>
          )}
          {canDisburse && r.status === 'posted' && !r.paidAt && (
            <button onClick={() => setDisburseTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600" title="Disburse salaries">
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
          {canExport && r.status !== 'cancelled' && (
            <button
              onClick={() => exportMutation.mutate(r.id)}
              disabled={exportMutation.isPending}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
              title="Export bank file (CSV)"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {canCancel && r.status === 'posted' && (
            <button onClick={() => setCancelTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600" title="Cancel">
              <XCircle className="h-4 w-4" />
            </button>
          )}
          {canDelete && r.status === 'draft' && (
            <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const itemColumns: Column<PayrollItem>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <span className="text-slate-700">
          {r.employee ? `${r.employee.code} · ${r.employee.fullName}` : '-'}
        </span>
      ),
    },
    { key: 'basic', header: 'Basic', render: (r) => <span className="text-xs text-slate-500">{money(r.basic)}</span> },
    { key: 'allowance', header: 'Allowance', render: (r) => <span className="text-xs text-slate-500">{money(r.allowance)}</span> },
    { key: 'overtime', header: 'Overtime', render: (r) => <span className="text-xs text-slate-500">{money(r.overtimeAmount)} ({r.overtimeHours}h)</span> },
    { key: 'absent', header: 'Absents', render: (r) => <span className="text-xs text-red-500">{money(r.absentDeduction)} ({r.absentDays}d)</span> },
    { key: 'deduction', header: 'Deductions', render: (r) => <span className="text-xs text-red-500">{money(r.totalDeduction)}</span> },
    { key: 'net', header: 'Net Pay', render: (r) => <span className="font-medium text-slate-800">{money(r.netPay)}</span> },
    ...(detail?.status === 'draft' && canUpdate
      ? ([
          {
            key: 'editOT',
            header: 'OT (hrs)',
            render: (r: PayrollItem) => (
              <Input
                type="number"
                min={0}
                step="0.5"
                className="w-20 py-1"
                value={editFor(r).overtimeHours}
                onChange={(e) => setEdit(r.id, 'overtimeHours', e.target.value === '' ? 0 : Number(e.target.value))}
              />
            ),
          },
          {
            key: 'editDed',
            header: 'Deduction',
            render: (r: PayrollItem) => (
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-24 py-1"
                value={editFor(r).otherDeduction}
                onChange={(e) => setEdit(r.id, 'otherDeduction', e.target.value === '' ? 0 : Number(e.target.value))}
              />
            ),
          },
        ] as Column<PayrollItem>[])
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Generate salary runs from attendance and post them to accounting."
        actions={
          canCreate && (
            <Button onClick={() => { setGenError(''); setGenOpen(true); }}>
              <Plus className="h-4 w-4" /> Generate Payroll
            </Button>
          )
        }
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <DataTable<PayrollRun>
          columns={columns}
          data={runs?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          page={page}
          pageSize={20}
          total={runs?.total}
          onPageChange={setPage}
          emptyTitle="No payroll runs yet"
          emptyMessage="Generate your first payroll run for a month to see it here."
        />
      </Card>

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate Payroll" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setGenError('');
            genMutation.mutate({
              periodMonth: genMonth,
              periodYear: genYear,
              payDate: payDate || undefined,
              note: note || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Month" required>
              <Select value={genMonth} onChange={(e) => setGenMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Year" required>
              <Input type="number" min={2000} value={genYear} onChange={(e) => setGenYear(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Pay Date">
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {genError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{genError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button type="submit" loading={genMutation.isPending}>Generate</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!detailId}
        onClose={() => { setDetailId(null); setEdits({}); }}
        title={detail ? `Payroll ${detail.number} — ${detail.periodLabel}` : 'Payroll'}
        size="xl"
      >
        {detailLoading && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-4 text-sm">
              <StatusBadge status={detail.status} />
              {detail.paidAt && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Disbursed {dateOnly(detail.paidAt)}
                </span>
              )}
              <span className="text-slate-600">Created {dateOnly(detail.createdAt)}</span>
              {detail.voucherNo && <span className="text-slate-600">Voucher: {detail.voucherNo}</span>}
              <div className="ml-auto flex items-center gap-2">
                {canExport && detail.status !== 'cancelled' && (
                  <Button size="sm" variant="outline" onClick={() => exportMutation.mutate(detail.id)} loading={exportMutation.isPending}>
                    <Download className="h-4 w-4" /> Bank File
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setPrintTargetId(detail.id)}>
                  <Printer className="h-4 w-4" /> Payslips
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm font-medium">
              <span className="text-slate-600">Gross {money(detail.totalGross)}</span>
              <span className="text-red-500">− Deductions {money(detail.totalDeduction)}</span>
              <span className="text-teal-700">= Net {money(detail.totalNet)}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    {itemColumns.map((c) => (
                      <th key={c.key} className="px-3 py-2.5 font-medium">{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(detail.items ?? []).map((item) => (
                    <FragmentItem key={item.id} item={item} itemColumns={itemColumns} />
                  ))}
                </tbody>
              </table>
            </div>

            {dirty && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEdits({})}>Revert</Button>
                <Button onClick={saveEdits} loading={updateItemsMutation.isPending}>
                  <Printer className="h-4 w-4" /> Save Adjustments
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!printTargetId}
        onClose={() => setPrintTargetId(null)}
        title={printData ? `Payslips — ${printData.number} (${printData.periodLabel})` : 'Payslips'}
        size="xl"
      >
        {printData && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            </div>
            {(printData.items ?? []).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <div className="font-semibold text-slate-800">{item.employee?.fullName ?? item.employeeId}</div>
                    <div className="text-xs text-slate-500">
                      {item.employee?.code} {item.employee?.department ? `· ${item.employee.department.name}` : ''}
                      {item.employee?.bankAccount ? `· A/C ${item.employee.bankAccount}` : ''}
                    </div>
                  </div>
                  <div className="font-medium text-teal-700">Net {money(item.netPay)}</div>
                </div>
                <div className="grid grid-cols-1 gap-1 pt-2 sm:grid-cols-3">
                  <div>Basic <span className="float-right font-medium text-slate-700">{money(item.basic)}</span></div>
                  <div>Allowance <span className="float-right font-medium text-slate-700">{money(item.allowance)}</span></div>
                  <div>Overtime <span className="float-right font-medium text-slate-700">{money(item.overtimeAmount)}</span></div>
                  {(item.componentBreakdown ?? []).map((b) => (
                    <div key={b.name}>
                      {b.name}{' '}
                      <span className={`float-right font-medium ${b.type === 'EARNING' ? 'text-teal-700' : 'text-red-500'}`}>
                        {money(b.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-1">Total Deductions <span className="float-right font-medium text-red-600">{money(item.totalDeduction)}</span></div>
                  <div className="border-t border-slate-100 pt-1 font-semibold">Net Payable <span className="float-right text-teal-700">{money(item.netPay)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!disburseTarget} onClose={() => setDisburseTarget(null)} title="Disburse Salaries" size="sm">
        {disburseTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              disburseMutation.mutate({ id: disburseTarget.id, bankAccountId: disburseBank || undefined });
            }}
            className="space-y-4"
          >
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="text-slate-700 font-medium">
                {disburseTarget.number} — {disburseTarget.periodLabel} ({money(disburseTarget.totalNet)})
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                Creates a journal entry Dr Salaries Payable / Cr bank, then marks salaries as paid.
              </div>
            </div>
            <Field label="Bank Account">
              <Select value={disburseBank} onChange={(e) => setDisburseBank(e.target.value)}>
                <option value="">Use default bank</option>
                {bankOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDisburseTarget(null)}>Cancel</Button>
              <Button type="submit" loading={disburseMutation.isPending}>
                <CheckCircle2 className="h-4 w-4" /> Disburse
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!postTarget}
        title="Post payroll"
        message={`This will create a journal voucher for ${postTarget?.number} (${postTarget?.periodLabel}). This cannot be undone.`}
        confirmLabel="Post"
        loading={postMutation.isPending}
        onCancel={() => setPostTarget(null)}
        onConfirm={() => postTarget?.id && postMutation.mutate(postTarget.id)}
      />

      <Modal
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
        title="Cancel Payroll"
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!cancelReason.trim()) return;
            cancelMutation.mutate({ id: cancelTarget!.id, reason: cancelReason });
          }}
          className="space-y-4"
        >
          <Field label="Cancellation Reason" required>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(''); }}>Cancel</Button>
            <Button type="submit" variant="danger" loading={cancelMutation.isPending} disabled={!cancelReason.trim()}>
              Cancel Payroll
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete payroll"
        message={`Delete draft payroll ${deleteTarget?.number}?`}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
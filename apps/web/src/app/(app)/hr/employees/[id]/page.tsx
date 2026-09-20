'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateOnly, money } from '@/lib/utils';
import { toast } from 'sonner';
import type { Employee, LeaveBalance, SalaryRecord, SalaryStructureItem } from '@/lib/types';

interface ComponentsResponse {
  items: SalaryStructureItem[];
}

interface BalancesResponse {
  year: number;
  items: LeaveBalance[];
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { can } = useAuth();
  const canSetStructure = can('hr.employees.update');
  const canRecordSalary = can('hr.salary-history.create');

  const { data: employee } = useQuery<Employee>({
    queryKey: ['hr/employees', id],
    queryFn: () => apiFetch(`/hr/employees/${id}`),
  });

  const { data: structure } = useQuery<ComponentsResponse>({
    queryKey: ['hr/employees', id, 'structure'],
    queryFn: () => apiFetch(`/hr/employees/${id}/salary-structure`),
  });

  const { data: history } = useQuery<SalaryRecord[]>({
    queryKey: ['hr/employees', id, 'salary-history'],
    queryFn: () => apiFetch(`/hr/employees/${id}/salary-history`),
  });

  const { data: balances } = useQuery<BalancesResponse>({
    queryKey: ['hr/leaves', 'balances', id],
    queryFn: () => apiFetch(`/hr/leaves/balances?employeeId=${id}`),
  });

  const flatComponents = useFlatOptions('hr/salary-components');

  const structureByComponent = useMemo(() => {
    const map = new Map<string, SalaryStructureItem>();
    for (const item of structure?.items ?? []) map.set(item.componentId, item);
    return map;
  }, [structure]);

  const [values, setValues] = useState<Record<string, string>>({});

  const resolvedValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of flatComponents.options) {
      const link = structureByComponent.get(c.value);
      const fallback = link ? String(link.amount) : '';
      out[c.value] = values[c.value] ?? (fallback || '');
    }
    return out;
  }, [flatComponents.options, structureByComponent, values]);

  const structureMutation = useMutation({
    mutationFn: (items: { componentId: string; amount: number }[]) =>
      apiFetch(`/hr/employees/${id}/salary-structure`, { method: 'PUT', body: JSON.stringify({ items }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/employees', id, 'structure'] });
      toast.success('Salary structure saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  });

  const saveStructure = () => {
    const items = flatComponents.options.map((c) => ({
      componentId: c.value,
      amount: Number(resolvedValues[c.value] ?? 0) || 0,
    }));
    structureMutation.mutate(items);
  };

  const [salOpen, setSalOpen] = useState(false);
  const [sal, setSal] = useState({ basicSalary: '', allowance: '', effectiveDate: '', note: '' });

  const salaryMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch(`/hr/employees/${id}/salary-history`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/employees', id] });
      qc.invalidateQueries({ queryKey: ['hr/employees', id, 'salary-history'] });
      setSalOpen(false);
      setSal({ basicSalary: '', allowance: '', effectiveDate: '', note: '' });
      toast.success('Salary record applied');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const openSalary = () => {
    setSal({
      basicSalary: String(employee?.basicSalary ?? ''),
      allowance: String(employee?.allowance ?? 0),
      effectiveDate: new Date().toISOString().slice(0, 10),
      note: '',
    });
    setSalOpen(true);
  };

  const employeeBalances = balances?.items?.find((b) => b.employeeId === id);

  const displayName = employee?.fullName ?? 'Employee';

  return (
    <div>
      <div className="mb-4">
        <Link href="/hr/employees" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700">
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Link>
      </div>
      <PageHeader
        title={displayName}
        description={employee ? `${employee.code}${employee.department ? ` · ${employee.department.name}` : ''}${employee.designation ? ` · ${employee.designation.name}` : ''}` : 'Loading…'}
        actions={
          canRecordSalary ? (
            <Button onClick={openSalary}>
              <Save className="h-4 w-4" /> Apply New Salary
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Salary Structure</CardTitle></CardHeader>
            <CardBody>
            {flatComponents.isLoading ? (
              <p className="py-4 text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Set the amount for each active component. Leave 0 to skip. For percent components the value is a % of basic.
                </p>
                {flatComponents.options.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
                    No salary components yet.{' '}
                    <Link href="/hr/salary-components" className="text-teal-600 underline">Create some</Link> first.
                  </p>
                )}
                {flatComponents.options.map((c) => (
                  <div key={c.value} className="flex items-center gap-3">
                    <span className="w-40 truncate text-sm text-slate-700">{c.label}</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-32"
                      value={resolvedValues[c.value] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [c.value]: e.target.value }))}
                    />
                  </div>
                ))}
                {flatComponents.options.length > 0 && (
                  <div className="flex justify-end pt-2">
                    <Button onClick={saveStructure} loading={structureMutation.isPending}>
                      <Save className="h-4 w-4" /> Save Structure
                    </Button>
                  </div>
                )}
              </div>
            )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Leave Balances</CardTitle></CardHeader>
            <CardBody>
            {!employeeBalances || employeeBalances.balances.length === 0 ? (
              <p className="py-4 text-sm text-slate-400">No leave types defined.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {employeeBalances.balances.map((b) => (
                  <div key={b.leaveTypeId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-sm font-medium text-slate-700">{b.name}</div>
                    <div className="mt-1 flex items-end justify-between text-sm">
                      <span className="text-slate-500">Used <b className="text-slate-700">{b.used}</b> / {b.quota}</span>
                      <span className={b.remaining > 0 ? 'font-semibold text-teal-600' : 'font-semibold text-red-500'}>
                        {b.remaining} left
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardBody>
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Status', employee ? <StatusBadge status={employee.status} /> : '-'],
                ['Phone', employee?.phone ?? '-'],
                ['CNIC', employee?.cnic ?? '-'],
                ['Joining Date', employee?.joinDate ? dateOnly(employee.joinDate) : '-'],
                ['Employment Type', employee?.employmentType ?? '-'],
                ['Basic Salary', employee ? money(Number(employee.basicSalary)) : '-'],
                ['Allowance', employee ? money(Number(employee.allowance ?? 0)) : '-'],
                ['Bank', employee?.bankName ? `${employee.bankName}${employee.bankAccount ? ` · ${employee.bankAccount}` : ''}` : '-'],
                ['Exit Date', employee?.exitDate ? dateOnly(employee.exitDate) : '-'],
                ['Exit Reason', employee?.exitReason ?? '-'],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Salary History</CardTitle></CardHeader>
          <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Effective</th>
                  <th className="px-4 py-2.5 font-medium">Basic</th>
                  <th className="px-4 py-2.5 font-medium">Allowance</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No salary changes recorded yet.</td>
                  </tr>
                )}
                {(history ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 text-slate-600">{dateOnly(r.effectiveDate)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{money(r.basicSalary)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{money(r.allowance)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{r.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </CardBody>
        </Card>
      </div>

      <Modal open={salOpen} onClose={() => setSalOpen(false)} title={`Apply New Salary — ${displayName}`} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salaryMutation.mutate({
              basicSalary: Number(sal.basicSalary) || 0,
              allowance: Number(sal.allowance) || 0,
              effectiveDate: sal.effectiveDate,
              note: sal.note || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="New Basic Salary" required>
              <Input type="number" min={0} step="0.01" value={sal.basicSalary} onChange={(e) => setSal((s) => ({ ...s, basicSalary: e.target.value }))} />
            </Field>
            <Field label="Allowance" required>
              <Input type="number" min={0} step="0.01" value={sal.allowance} onChange={(e) => setSal((s) => ({ ...s, allowance: e.target.value }))} />
            </Field>
          </div>
          <Field label="Effective Date" required>
            <Input type="date" value={sal.effectiveDate} onChange={(e) => setSal((s) => ({ ...s, effectiveDate: e.target.value }))} />
          </Field>
          <Field label="Note">
            <Textarea value={sal.note} onChange={(e) => setSal((s) => ({ ...s, note: e.target.value }))} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={salaryMutation.isPending}>Apply</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
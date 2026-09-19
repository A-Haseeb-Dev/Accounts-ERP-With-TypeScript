'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CalendarDays, Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateOnly } from '@/lib/utils';
import { toast } from 'sonner';
import type { AttendanceStatus } from '@/lib/types';

const STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Leave' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'holiday', label: 'Holiday' },
];

interface DayRow {
  employeeId: string;
  status: string;
  overtimeHours: number;
  note?: string;
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canManage = can('hr.attendance.manage');

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: sheet, isLoading } = useQuery<AttendanceStatus[]>({
    queryKey: ['hr/attendance', 'by-day', date],
    queryFn: () => apiFetch(`/hr/attendance/by-day?date=${date}`),
  });

  const loadIntoRows = () => {
    if (!sheet) return;
    setRows(
      sheet.map((row) => ({
        employeeId: row.employee.id,
        status: row.attendance?.status ?? (row.employee.status === 'active' ? 'present' : 'present'),
        overtimeHours: Number(row.attendance?.overtimeHours ?? 0),
        note: row.attendance?.remarks ?? '',
      })),
    );
  };

  const bulkMutation = useMutation({
    mutationFn: (payload: { date: string; records: DayRow[] }) =>
      apiFetch('/hr/attendance/bulk', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr/attendance'] });
      toast.success('Attendance saved');
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  });

  const countBy = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Record daily attendance for every active employee."
        actions={
          canManage &&
          (editingId === null ? (
            <Button onClick={() => { loadIntoRows(); setEditingId(date); }}>
              <Save className="h-4 w-4" /> Enter Attendance
            </Button>
          ) : (
            <Button
              loading={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate({ date, records: rows })}
            >
              <Save className="h-4 w-4" /> Save for {dateOnly(date)}
            </Button>
          ))
        }
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <Field label="Date" className="min-w-44">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {rows.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-2 text-xs text-slate-500">
              <span>P: {countBy('present')}</span>
              <span>A: {countBy('absent')}</span>
              <span>L: {countBy('leave')}</span>
              <span>HD: {countBy('half_day')}</span>
              <span>H: {countBy('holiday')}</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Department</th>
                {editingId === date && <th className="px-4 py-3 font-medium">Status</th>}
                {editingId === date && <th className="px-4 py-3 font-medium">Overtime (hrs)</th>}
                <th className="px-4 py-3 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {(sheet ?? []).map((row) => {
                const current = rows.find((r) => r.employeeId === row.employee.id);
                return (
                  <tr key={row.employee.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{row.employee.code}</td>
                    <td className="px-4 py-2.5 text-slate-800">{row.employee.fullName}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {(row.employee as { department?: { name: string } }).department?.name ?? '-'}
                    </td>
                    {editingId === date && (
                      <td className="px-4 py-2.5">
                        <Select
                          className="w-36"
                          value={current?.status ?? ''}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((p) => (p.employeeId === row.employee.id ? { ...p, status: e.target.value } : p)),
                            )
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </Select>
                      </td>
                    )}
                    {editingId === date && (
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          className="w-24"
                          value={current?.overtimeHours ?? 0}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((p) =>
                                p.employeeId === row.employee.id
                                  ? { ...p, overtimeHours: e.target.value === '' ? 0 : Number(e.target.value) }
                                  : p,
                              ),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      {row.attendance ? (
                        <StatusBadge status={row.attendance.status} />
                      ) : (
                        <span className="text-xs text-slate-300">Not recorded</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && (sheet ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No active employees yet. Add employees first from the Employees page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
'use client';

import { SimpleMaster } from '@/components/simple-master';
import { money } from '@/lib/utils';
import type { Column } from '@/components/data-table';
import type { EmployeeLoan } from '@/lib/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const columns: Column<EmployeeLoan>[] = [
  {
    key: 'employee',
    header: 'Employee',
    render: (r) => (
      <span className="text-slate-700">
        {r.employee ? `${r.employee.code} · ${r.employee.fullName}` : '-'}
      </span>
    ),
  },
  { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium text-slate-800">{money(r.amount)}</span> },
  { key: 'installment', header: 'Monthly', render: (r) => <span className="text-slate-500">{money(r.installment)}</span> },
  {
    key: 'start',
    header: 'First Deduction',
    render: (r) => (
      <span className="text-xs text-slate-500">{MONTH_NAMES[Number(r.startMonth) - 1] ?? r.startMonth} {r.startYear}</span>
    ),
  },
  {
    key: 'remaining',
    header: 'Remaining',
    render: (r) => (
      <span className={Number(r.remaining) > 0 ? 'text-amber-600' : 'text-slate-400'}>{money(r.remaining ?? 0)}</span>
    ),
  },
];

export default function LoansPage() {
  return (
    <SimpleMaster<EmployeeLoan>
      config={{
        apiPath: '/hr/loans',
        title: 'Employee Loans',
        description: 'Loan / advance balances given to employees — installments are deducted automatically in payroll.',
        singular: 'Loan',
        permission: 'hr.loans.view',
        columns,
        fields: [
          { name: 'employeeId', label: 'Employee', type: 'select', optionsResource: 'hr/employees', required: true },
          { name: 'amount', label: 'Loan Amount', type: 'number', required: true },
          { name: 'installment', label: 'Monthly Installment', type: 'number', required: true },
          { name: 'startMonth', label: 'First Deduction Month', type: 'number', required: true },
          { name: 'startYear', label: 'First Deduction Year', type: 'number', required: true },
          { name: 'note', label: 'Note', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}
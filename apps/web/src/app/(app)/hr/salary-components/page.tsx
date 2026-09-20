'use client';

import { SimpleMaster } from '@/components/simple-master';
import { money } from '@/lib/utils';
import type { Column } from '@/components/data-table';
import type { SalaryComponent } from '@/lib/types';

function Badge({ value, tone }: { value: string; tone: 'teal' | 'red' | 'slate' }) {
  const tones: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{value}</span>
  );
}

const columns: Column<SalaryComponent>[] = [
  { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-700">{r.name}</span> },
  {
    key: 'type',
    header: 'Type',
    render: (r) => <Badge value={r.type} tone={r.type === 'EARNING' ? 'teal' : 'red'} />,
  },
  {
    key: 'calcType',
    header: 'Calculation',
    render: (r) => <span className="text-slate-500">{r.calcType === 'PERCENT_BASIC' ? `${r.value}% of basic` : money(r.value)}</span>,
  },
  { key: 'sortOrder', header: 'Sort', render: (r) => <span className="text-xs text-slate-400">{r.sortOrder}</span> },
];

export default function SalaryComponentsPage() {
  return (
    <SimpleMaster<SalaryComponent>
      config={{
        apiPath: '/hr/salary-components',
        title: 'Salary Components',
        description: 'Build blocks of the payslip — earnings and deductions applied automatically to every payroll run.',
        singular: 'Salary Component',
        permission: 'hr.salary-components.view',
        columns,
        fields: [
          { name: 'name', label: 'Component Name', required: true, placeholder: 'e.g. House Rent, Conveyance, Income Tax' },
          {
            name: 'type',
            label: 'Type',
            type: 'status',
            required: true,
            options: [
              { value: 'EARNING', label: 'Earning' },
              { value: 'DEDUCTION', label: 'Deduction' },
            ],
          },
          {
            name: 'calcType',
            label: 'Calculation',
            type: 'select',
            required: true,
            options: [
              { value: 'FIXED', label: 'Fixed amount' },
              { value: 'PERCENT_BASIC', label: 'Percent of basic' },
            ],
          },
          { name: 'value', label: 'Value (amount or %)', type: 'number', required: true },
          { name: 'sortOrder', label: 'Sort Order', type: 'number' },
        ],
      }}
    />
  );
}
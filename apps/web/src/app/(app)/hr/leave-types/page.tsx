'use client';

import { SimpleMaster } from '@/components/simple-master';
import type { Column } from '@/components/data-table';
import type { HrLeaveType } from '@/lib/types';

const columns: Column<HrLeaveType>[] = [
  { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-700">{r.name}</span> },
  {
    key: 'paid',
    header: 'Paid',
    render: (r) => (r.paid ? <span className="text-teal-600">Paid</span> : <span className="text-slate-400">Unpaid</span>),
  },
  {
    key: 'annualQuota',
    header: 'Annual Quota',
    render: (r) => <span className="text-slate-600">{r.annualQuota} days</span>,
  },
  { key: 'description', header: 'Description', render: (r) => <span className="text-slate-500">{r.description ?? '-'}</span> },
];

export default function LeaveTypesPage() {
  return (
    <SimpleMaster<HrLeaveType>
      config={{
        apiPath: '/hr/leave-types',
        title: 'Leave Types',
        description: 'Configure the kinds of leave employees can apply for.',
        singular: 'Leave Type',
        permission: 'hr.leaves.view',
        columns,
        fields: [
          { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Casual Leave' },
          {
            name: 'paid',
            label: 'Paid Leave',
            type: 'boolean',
          },
          { name: 'annualQuota', label: 'Annual Quota (days)', type: 'number' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}
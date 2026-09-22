'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { SimpleMaster } from '@/components/simple-master';
import type { Column } from '@/components/data-table';
import type { Employee } from '@/lib/types';
import { dateOnly, money } from '@/lib/utils';

const columns: Column<Employee>[] = [
  { key: 'code', header: 'Code', render: (r) => <span className="font-medium text-slate-700">{r.code}</span> },
  { key: 'fullName', header: 'Name', render: (r) => <span className="text-slate-800">{r.fullName}</span> },
  {
    key: 'department',
    header: 'Department',
    render: (r) => <span className="text-slate-500">{r.department ? r.department.name : '-'}</span>,
  },
  {
    key: 'designation',
    header: 'Designation',
    render: (r) => <span className="text-slate-500">{r.designation ? r.designation.name : '-'}</span>,
  },
  { key: 'phone', header: 'Phone', render: (r) => <span className="text-slate-500">{r.phone ?? '-'}</span> },
  { key: 'joinDate', header: 'Joining', render: (r) => <span className="text-xs text-slate-400">{dateOnly(r.joinDate)}</span> },
  {
    key: 'salary',
    header: 'Salary',
    render: (r) => <span className="text-slate-600">{money(Number(r.basicSalary) + Number(r.allowance || 0))}</span>,
  },
  {
    key: 'actions',
    header: 'Actions',
    className: 'w-14',
    render: (r) => (
      <Link
        href={`/hr/employees/${r.id}`}
        className="inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700"
        title="Salary, leave balances & history"
      >
        <Eye className="h-4 w-4" />
      </Link>
    ),
  },
];

export default function EmployeesPage() {
  return (
    <SimpleMaster<Employee>
      config={{
        apiPath: '/hr/employees',
        title: 'Employees',
        description: 'Your workforce — the people whose salaries payroll is computed from.',
        singular: 'Employee',
        permission: 'hr.employees.view',
        columns,
        fields: [
          { name: 'code', label: 'Employee Code', auto: true, placeholder: 'e.g. EMP-001' },
          { name: 'fullName', label: 'Full Name', required: true, placeholder: 'e.g. Muhammad Ahmed' },
          { name: 'fatherName', label: 'Father Name' },
          { name: 'cnic', label: 'CNIC' },
          { name: 'phone', label: 'Phone' },
          { name: 'email', label: 'Email' },
          { name: 'address', label: 'Address', type: 'textarea' },
          { name: 'departmentId', label: 'Department', type: 'select', optionsResource: 'hr/departments' },
          { name: 'designationId', label: 'Designation', type: 'select', optionsResource: 'hr/designations' },
          { name: 'joinDate', label: 'Joining Date', type: 'date' },
          { name: 'basicSalary', label: 'Basic Salary', type: 'number' },
          { name: 'allowance', label: 'Allowance', type: 'number' },
          { name: 'employmentType', label: 'Employment Type', type: 'select', options: [
            { value: 'permanent', label: 'Permanent' },
            { value: 'contract', label: 'Contract' },
            { value: 'probation', label: 'Probation' },
            { value: 'intern', label: 'Intern' },
          ] },
          { name: 'bankName', label: 'Bank Name' },
          { name: 'bankAccount', label: 'Bank Account' },
          { name: 'mainAccountId', label: 'Main Account', type: 'select', optionsResource: 'main-accounts' },
          { name: 'exitDate', label: 'Exit Date', type: 'date' },
          { name: 'exitReason', label: 'Exit Reason', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}
'use client';

import { SimpleMaster } from '@/components/simple-master';
import type { HeadAccount } from '@/lib/types';

const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
];

export default function HeadAccountsPage() {
  return (
    <SimpleMaster<HeadAccount>
      config={{
        apiPath: '/head-accounts',
        title: 'Head Accounts',
        description: 'Top-level classification of the chart of accounts for types (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE).',
        singular: 'Head Account',
        permission: 'administration.head-accounts.view',
        columns: [
          { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.code}</span> },
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
          { key: 'description', header: 'Description', render: (r) => r.description ? <span className="text-slate-500">{r.description}</span> : '-' },
        ],
        fields: [
          {
            name: 'accountType',
            label: 'Account Type',
            type: 'select',
            required: true,
            createOnly: true,
            options: ACCOUNT_TYPES,
          },
          {
            name: 'code',
            label: 'Code',
            auto: true,
            required: true,
          },
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Current Assets' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
        // The type fixes the code's letter, so it is chosen before the code.
        nextCodeDependsOn: ['accountType'],
      }}
    />
  );
}

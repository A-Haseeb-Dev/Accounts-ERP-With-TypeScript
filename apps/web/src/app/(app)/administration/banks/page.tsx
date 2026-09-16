'use client';

import { SimpleMaster, type SimpleMasterConfig } from '@/components/simple-master';
import { useFlatOptions } from '@/hooks/use-options';
import type { BankAccount } from '@/lib/types';

export default function BanksPage() {
  const { options: mainAccountOptions } = useFlatOptions('main-accounts');

  const config: SimpleMasterConfig<BankAccount> = {
    apiPath: '/banks',
    title: 'Bank Accounts',
    description: 'Bank accounts used in receipts, payments and cheque clearing. Each bank is linked to a GL account.',
    singular: 'Bank account',
    permission: 'administration.main-accounts.view',
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
      { key: 'accountTitle', header: 'Account title', render: (r) => <span className="text-slate-600">{r.accountTitle ?? '-'}</span> },
      { key: 'accountNumber', header: 'Account no.', render: (r) => <span className="font-mono text-slate-600">{r.accountNumber ?? '-'}</span> },
      { key: 'gl', header: 'GL account', render: (r) => <span className="text-slate-600">{r.mainAccount ? `${r.mainAccount.code} · ${r.mainAccount.name}` : <span className="text-amber-600">Not linked</span>}</span> },
    ],
    fields: [
      { name: 'name', label: 'Bank name', required: true, placeholder: 'e.g. Meezan Bank' },
      { name: 'accountTitle', label: 'Account title', placeholder: 'e.g. ABC Traders' },
      { name: 'accountNumber', label: 'Account number', placeholder: 'e.g. 0039 0100 1234 5678' },
      {
        name: 'mainAccountId',
        label: 'GL account (for cheque clearing)',
        type: 'select',
        options: mainAccountOptions,
      },
      { name: 'status', label: 'Status', type: 'status' },
    ],
  };

  return <SimpleMaster config={config} />;
}
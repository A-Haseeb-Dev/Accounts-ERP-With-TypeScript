'use client';

import { SimpleMaster } from '@/components/simple-master';

export default function TownsPage() {
  return (
    <SimpleMaster
      config={{
        apiPath: '/towns',
        title: 'Towns',
        description: 'Geographic areas used to group customers and suppliers and power town-wise reporting.',
        singular: 'Town',
        permission: 'administration.towns.view',
        columns: [
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{String(r.name)}</span> },
          { key: 'city', header: 'City', render: (r) => <span className="text-slate-500">{r.city ? String(r.city) : '-'}</span> },
          { key: 'description', header: 'Description', render: (r) => r.description ? <span className="text-slate-500">{String(r.description)}</span> : '-' },
        ],
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Sadar Bazaar' },
          { name: 'city', label: 'City', type: 'text', placeholder: 'e.g. Karachi' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}
'use client';

import { useFlatOptions } from '@/hooks/use-options';
import { DocumentPage } from '@/components/tx/document-page';

export default function SalesInvoicesPage() {
  const { options: customerOptions } = useFlatOptions('customers');
  const { options: locationOptions } = useFlatOptions('stock-locations');

  return (
    <DocumentPage
      config={{
        resource: 'sales',
        title: 'Sales Invoices',
        description: 'Sales that move stock out and create receivables.',
        dateField: 'saleDate',
        partyLabel: 'Customer',
        partyParam: 'customerId',
        partyOptions: customerOptions,
        priceKey: 'unitPrice',
        itemLineField: 'unitPrice',
        locationOptions,
        showAmountPaid: true,
        newLabel: 'Sale',
      }}
    />
  );
}
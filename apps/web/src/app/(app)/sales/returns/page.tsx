'use client';

import { useFlatOptions } from '@/hooks/use-options';
import { DocumentPage } from '@/components/tx/document-page';

export default function SalesReturnsPage() {
  const { options: customerOptions } = useFlatOptions('customers');
  const { options: locationOptions } = useFlatOptions('stock-locations');

  return (
    <DocumentPage
      config={{
        resource: 'sales-returns',
        title: 'Sales Returns',
        description: 'Customer returns that move stock back into your locations.',
        dateField: 'returnDate',
        partyLabel: 'Customer',
        partyParam: 'customerId',
        partyOptions: customerOptions,
        priceKey: 'unitPrice',
        itemLineField: 'unitPrice',
        locationOptions,
        newLabel: 'Sales Return',
      }}
    />
  );
}
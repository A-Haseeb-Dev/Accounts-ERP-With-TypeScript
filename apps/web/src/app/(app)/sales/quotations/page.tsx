'use client';

import { useFlatOptions } from '@/hooks/use-options';
import { QuotationPage } from '@/components/tx/quotation-page';

export default function SalesQuotationsPage() {
  const { options: customerOptions } = useFlatOptions('customers');

  return <QuotationPage customerOptions={customerOptions} />;
}

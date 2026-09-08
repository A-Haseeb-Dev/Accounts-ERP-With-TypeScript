'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { PrintableDocument } from '@/components/tx/printable-document';
import {
  PRINT_DEFAULTS,
  type InvoiceTemplate,
  type PrintFontSize,
  type PrintHeaderAlign,
  type PrintLogoSize,
  type PrintSettings,
} from '@/hooks/use-print-settings';
import type { TransactionDoc } from '@/lib/types';

type Settings = Record<string, string>;

/** field name → server dot-key, plus the fallback value when unset. */
const FIELDS: Record<string, { key: string; def: string }> = {
  invoiceTemplate: { key: 'print.invoiceTemplate', def: PRINT_DEFAULTS.invoiceTemplate },
  paperSize: { key: 'print.paperSize', def: PRINT_DEFAULTS.paperSize },
  printScale: { key: 'print.scale', def: String(PRINT_DEFAULTS.printScale) },
  fontSize: { key: 'print.fontSize', def: PRINT_DEFAULTS.fontSize },
  logoSize: { key: 'print.logoSize', def: PRINT_DEFAULTS.logoSize },
  invoiceHeaderAlign: { key: 'print.invoiceHeaderAlign', def: PRINT_DEFAULTS.invoiceHeaderAlign },
  invoiceShowBalance: { key: 'print.invoiceShowBalance', def: 'true' },
  invoiceShowAmountWords: { key: 'print.invoiceShowAmountWords', def: 'true' },
  invoiceShowDate: { key: 'print.invoiceShowDate', def: 'true' },
  invoiceShowSignatures: { key: 'print.invoiceShowSignatures', def: 'true' },
  invoiceShowPartyContact: { key: 'print.invoiceShowPartyContact', def: 'true' },
  invoiceShowItemCode: { key: 'print.invoiceShowItemCode', def: 'true' },
  invoiceShowDiscountCol: { key: 'print.invoiceShowDiscountCol', def: 'true' },
  invoiceShowTaxCol: { key: 'print.invoiceShowTaxCol', def: 'true' },
  showPageNumbers: { key: 'print.showPageNumbers', def: 'true' },
};

const SAMPLE_DETAIL: TransactionDoc = {
  id: 'layout-preview',
  number: 'SI-2026-000123',
  status: 'posted',
  paymentStatus: 'partial',
  subtotal: 4300,
  discount: 100,
  tax: 60,
  grandTotal: 4260,
  amountPaid: 2000,
  note: 'E&OE. Goods once sold will not be taken back.',
  customer: { id: 'c1', name: 'Ahmed Traders', phone: '+92 300 1234567', address: 'Shop 5, Main Bazaar, Lahore' },
  stockLocation: { id: 'l1', name: 'Main Store' },
  saleDate: new Date().toISOString(),
  items: [
    { id: 'a', itemId: 'i1', quantity: 4, unitPrice: 700, discount: 0, tax: 0, lineTotal: 2800, item: { id: 'i1', code: 'A-001', name: 'Widget Pro' } },
    { id: 'b', itemId: 'i2', quantity: 1, unitPrice: 1500, discount: 100, tax: 60, lineTotal: 1460, item: { id: 'i2', code: 'K-099', name: 'Deluxe Kit' } },
  ],
};

export default function PrintLayoutPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
  });

  const [form, setForm] = useState<Settings>({});
  const [error, setError] = useState('');

  const set = (field: string, v: string) => setForm((f) => ({ ...f, [field]: v }));

  const value = (field: string): string =>
    form[field] ?? (data ? data[FIELDS[field].key] : undefined) ?? FIELDS[field].def;

  const save = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/system/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError('');
    const payload: Record<string, string> = {};
    for (const field of Object.keys(FIELDS)) payload[field] = value(field);
    save.mutate(payload);
  };

  const resetToDefaults = () => {
    setError('');
    const payload: Record<string, string> = {};
    for (const field of Object.keys(FIELDS)) payload[field] = FIELDS[field].def;
    setForm(payload);
    save.mutate(payload);
  };

  const fmtOverride: PrintSettings = {
    invoiceShowBalance: value('invoiceShowBalance') === 'true',
    invoiceShowAmountWords: value('invoiceShowAmountWords') === 'true',
    invoiceShowDate: value('invoiceShowDate') === 'true',
    reportShowBranding: false,
    reportShowLogo: false,
    paperSize: value('paperSize'),
    printScale: Number(value('printScale')),
    invoiceTemplate: value('invoiceTemplate') as InvoiceTemplate,
    fontSize: value('fontSize') as PrintFontSize,
    logoSize: value('logoSize') as PrintLogoSize,
    invoiceShowSignatures: value('invoiceShowSignatures') === 'true',
    invoiceShowPartyContact: value('invoiceShowPartyContact') === 'true',
    invoiceShowItemCode: value('invoiceShowItemCode') === 'true',
    invoiceShowDiscountCol: value('invoiceShowDiscountCol') === 'true',
    invoiceShowTaxCol: value('invoiceShowTaxCol') === 'true',
    invoiceHeaderAlign: value('invoiceHeaderAlign') as PrintHeaderAlign,
    showPageNumbers: value('showPageNumbers') === 'true',
  };

  const thermal = value('invoiceTemplate') === 'thermal';
  const yN = (field: string, label: string) => (
    <Field label={label}>
      <Select value={value(field)} onChange={(e) => set(field, e.target.value)}>
        <option value="true">Show</option>
        <option value="false">Hide</option>
      </Select>
    </Field>
  );

  return (
    <div>
      <PageHeader
        title="Print Layout"
        description="Design how invoices print — template, paper, font and which sections appear. Changes save to Settings and apply to every document you print."
      />

      <Card>
        <div className="flex flex-wrap gap-6 p-5">
          {isLoading ? (
            <p className="py-10 text-sm text-slate-400">Loading settings…</p>
          ) : (
            <>
              {/* Controls */}
              <div className="max-w-sm flex-1 space-y-5">
                <div>
                  <p className="mb-3 text-sm font-semibold text-slate-700">Layout</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Template">
                      <Select value={value('invoiceTemplate')} onChange={(e) => set('invoiceTemplate', e.target.value)}>
                        <option value="standard">Standard (A4)</option>
                        <option value="compact">Compact</option>
                        <option value="thermal">Thermal (80mm)</option>
                      </Select>
                    </Field>
                    <Field label="Paper Size" hint={thermal ? 'Thermal ignores paper size' : undefined}>
                      <Select value={value('paperSize')} onChange={(e) => set('paperSize', e.target.value)} disabled={thermal}>
                        <option value="A4">A4</option>
                        <option value="A5">A5</option>
                        <option value="Letter">Letter</option>
                      </Select>
                    </Field>
                    <Field label="Print Scale" hint="Shrink output for tight printers">
                      <Select value={value('printScale')} onChange={(e) => set('printScale', e.target.value)}>
                        <option value="100">100%</option>
                        <option value="95">95%</option>
                        <option value="90">90%</option>
                        <option value="85">85%</option>
                        <option value="80">80%</option>
                        <option value="75">75%</option>
                        <option value="70">70%</option>
                        <option value="60">60%</option>
                        <option value="50">50%</option>
                      </Select>
                    </Field>
                    <Field label="Font Size">
                      <Select value={value('fontSize')} onChange={(e) => set('fontSize', e.target.value)}>
                        <option value="small">Small</option>
                        <option value="normal">Normal</option>
                        <option value="large">Large</option>
                      </Select>
                    </Field>
                    <Field label="Logo Size">
                      <Select value={value('logoSize')} onChange={(e) => set('logoSize', e.target.value)}>
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                      </Select>
                    </Field>
                    <Field label="Header Alignment">
                      <Select value={value('invoiceHeaderAlign')} onChange={(e) => set('invoiceHeaderAlign', e.target.value)} disabled={thermal}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                      </Select>
                    </Field>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-sm font-semibold text-slate-700">Show / Hide</p>
                  <div className="grid grid-cols-2 gap-4">
                    {yN('invoiceShowBalance', 'Balance Due')}
                    {yN('invoiceShowAmountWords', 'Amount in Words')}
                    {yN('invoiceShowDate', 'Invoice Date')}
                    {yN('invoiceShowSignatures', 'Signature Lines')}
                    {yN('invoiceShowPartyContact', 'Party Contact')}
                    {yN('invoiceShowItemCode', 'Item Code')}
                    {yN('invoiceShowDiscountCol', 'Discount Column')}
                    {yN('invoiceShowTaxCol', 'Tax Column')}
                    {yN('showPageNumbers', 'Page Numbers')}
                  </div>
                </div>

                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
                <div className="flex items-center gap-3">
                  <Button onClick={submit} loading={save.isPending}>Save Layout</Button>
                  <Button type="button" variant="outline" onClick={resetToDefaults}>Reset to Defaults</Button>
                  {save.isSuccess && <span className="text-sm font-medium text-emerald-600">Saved</span>}
                </div>
                <p className="text-xs text-slate-400">
                  Apply to a live document from Sales → Sales Invoices → open an invoice → Print / Preview. Reports use
                  the same paper size and scale.
                </p>
              </div>

              {/* Live preview */}
              <div className="min-w-0 flex-1 basis-96">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Live Preview</p>
                <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-6">
                  <div style={{ zoom: thermal ? 0.85 : 0.55 }}>
                    <PrintableDocument
                      open
                      preview
                      detail={SAMPLE_DETAIL}
                      title="Sales Invoice"
                      partyLabel="Customer"
                      dateField="saleDate"
                      priceKey="unitPrice"
                      showAmountPaid
                      docType="sale"
                      fmtOverride={fmtOverride}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
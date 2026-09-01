'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Select, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import type { Option } from '@/hooks/use-options';
import { money, num } from '@/lib/utils';

export interface LineItem {
  key: string;
  itemId?: string;
  itemName?: string;
  quantity: number;
  price: number;
  discount: number;
  tax: number;
}

interface ItemsEditorProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  itemOptions: Option[];
  priceKey: 'unitCost' | 'unitPrice';
}

export function ItemsEditor({ items, onChange, itemOptions, priceKey }: ItemsEditorProps) {
  const addLine = () => {
    onChange([
      ...items,
      { key: crypto.randomUUID?.() ?? String(Date.now()), quantity: 1, price: 0, discount: 0, tax: 0 },
    ]);
  };

  const update = (key: string, patch: Partial<LineItem>) => {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const remove = (key: string) => {
    onChange(items.filter((i) => i.key !== key));
  };

  const onPickItem = (key: string, value: string) => {
    const opt = itemOptions.find((o) => o.value === value);
    update(key, { itemId: value, itemName: opt?.label });
  };

  const subtotal = items.reduce((s, i) => s + i.quantity * i.price, 0);
  const totalDiscount = items.reduce((s, i) => s + i.discount, 0);
  const totalTax = items.reduce((s, i) => s + i.tax, 0);
  const grand = subtotal - totalDiscount + totalTax;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-3 py-2">Item</th>
              <th className="w-20 px-3 py-2 text-right">Qty</th>
              <th className="w-28 px-3 py-2 text-right">{priceKey === 'unitCost' ? 'Unit Cost' : 'Unit Price'}</th>
              <th className="w-24 px-3 py-2 text-right">Line Total</th>
              <th className="w-10 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const lineTotal = i.quantity * i.price - i.discount + i.tax;
              return (
                <tr key={i.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5">
                    <Select
                      value={i.itemId ?? ''}
                      onChange={(e) => onPickItem(i.key, e.target.value)}
                      className="min-w-[180px]"
                    >
                      <option value="">Select item…</option>
                      {itemOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      min={1}
                      value={String(i.quantity)}
                      onChange={(e) => update(i.key, { quantity: Number(e.target.value) || 0 })}
                      className="text-right"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(i.price)}
                      onChange={(e) => update(i.key, { price: Number(e.target.value) || 0 })}
                      className="text-right"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-slate-700">
                    {money(lineTotal, 'PKR')}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <button onClick={() => remove(i.key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">No lines yet — add an item.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="secondary" size="sm" onClick={addLine} className="mt-2">
        <Plus className="h-4 w-4" /> Add line
      </Button>

      <div className="mt-3 space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <SummaryRow label="Subtotal" value={money(subtotal, 'PKR')} />
        <SummaryRow label="Discount" value={`- ${money(totalDiscount, 'PKR')}`} />
        <SummaryRow label="Tax" value={money(totalTax, 'PKR')} />
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-800">
          <span>Grand total</span>
          <span>{money(grand, 'PKR')}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
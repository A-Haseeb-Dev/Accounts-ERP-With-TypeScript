'use client';

import { Modal } from '@/components/ui/modal';
import { money } from '@/lib/utils';

export interface ReturnItemLine {
  id: string;
  name: string;
  code?: string;
  quantity: number;
  rate: number;
  discount?: number;
  tax: number;
  lineTotal: number;
}

/**
 * Read-only item breakdown of a sales / purchase return, shown from the
 * return reports. Both document types share the same shape once normalized,
 * so callers pass `partyLabel` to switch the heading between Customer and
 * Supplier instead of duplicating the modal.
 */
export function ReturnItemsModal({
  number,
  date,
  partyLabel,
  partyName,
  againstLabel,
  againstNumber,
  status,
  tax,
  grandTotal,
  items,
  onClose,
}: {
  number: string;
  date: string;
  partyLabel: string;
  partyName: string;
  againstLabel: string;
  againstNumber?: string | null;
  status: string;
  tax: number;
  grandTotal: number;
  items: ReturnItemLine[];
  onClose: () => void;
}) {
  const totalQty = items.reduce((s, i) => s + Number(i.quantity), 0);
  const totalLine = items.reduce((s, i) => s + Number(i.lineTotal), 0);

  return (
    <Modal open onClose={onClose} title={`${number} — Return Items`} size="lg">
      <div>
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <KV label="Date" value={new Date(date).toLocaleDateString('en-GB')} />
          <KV label={partyLabel} value={partyName || '—'} />
          <KV label={againstLabel} value={againstNumber || '—'} />
          <KV label="Status" value={status} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No items on this return.</td></tr>
              )}
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-800">
                    {i.name} {i.code && <span className="text-xs text-slate-400">({i.code})</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{Number(i.quantity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{money(i.rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{money(i.tax)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{money(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <td className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                <td className="px-3 py-2 text-right tabular-nums">{totalQty}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{money(tax)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {Math.abs(totalLine - Number(grandTotal)) > 0.01 && (
          <p className="mt-2 text-xs text-slate-500">Item lines total {money(totalLine)}; document total is {money(grandTotal)}.</p>
        )}
      </div>
    </Modal>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

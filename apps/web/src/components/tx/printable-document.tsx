'use client';

/**
 * Professional printable document template (invoice / bill / return / statement).
 *
 * Rendered into an off-screen print node and printed via an isolated iframe so
 * only the document appears (no app chrome). Styling is inline / print-only so
 * it survives isolation.
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { money, dateTime } from '@/lib/utils';

interface PrintLine {
  item?: { code?: string; name?: string } | null;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export interface PrintableDocumentProps {
  open: boolean;
  detail: Record<string, unknown> | null | undefined;
  title: string;
  partyLabel: string;
  dateField: string;
  priceKey: 'unitCost' | 'unitPrice';
  showAmountPaid: boolean;
}

export function PrintableDocument({
  open,
  detail,
  title,
  partyLabel,
  dateField,
  priceKey,
  showAmountPaid,
}: PrintableDocumentProps) {
  const { data: branding } = useQuery<Record<string, unknown> | null>({
    queryKey: ['branding'],
    queryFn: () => apiFetch('/system/branding'),
    staleTime: Infinity,
  });

  if (!open || !detail) return null;

  const items = (detail.items as unknown as PrintLine[] | undefined) ?? [];
  const unit = (l: PrintLine) => (priceKey === 'unitCost' ? l.unitCost : l.unitPrice);
  const party = (detail.party ?? detail.customer ?? detail.supplier) as Record<string, unknown> | null | undefined;
  const location = (detail.stockLocation ?? detail.location) as Record<string, unknown> | null | undefined;

  const sub = items.reduce((s, l) => s + l.quantity * unit(l), 0);
  const discount = Number(detail.discount ?? 0);
  const tax = Number(detail.tax ?? 0);
  const grandTotal = Number(detail.grandTotal ?? sub - discount + tax);
  const amountPaid = Number(detail.amountPaid ?? 0);
  const balance = grandTotal - (showAmountPaid ? amountPaid : 0);

  return (
    <div
      id="printable-document"
      style={{
        position: 'fixed',
        left: '-200vw',
        top: 0,
        width: '210mm',
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
        fontSize: '12px',
        lineHeight: 1.4,
        zIndex: -1,
      }}
    >
      {/* Header / branding */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid ' + (branding?.primaryColor ?? '#0f766e'), paddingBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: branding?.primaryColor ?? '#0f766e' }}>
            {String(branding?.businessName ?? 'Your Business')}
          </div>
          {branding?.shortName && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{String(branding.shortName)}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>#{String(detail.number ?? detail.code ?? '')}</div>
          <div style={{ color: '#64748b', marginTop: 2 }}>{dateTime(detail[dateField] ?? new Date())}</div>
        </div>
      </div>

      {/* Bill to */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', fontWeight: 600 }}>{partyLabel}</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{party ? String((party as Record<string, unknown>).name ?? '') : '—'}</div>
          {party && (party as Record<string, unknown>).phone && (
            <div style={{ color: '#475569', marginTop: 2 }}>{String((party as Record<string, unknown>).phone)}</div>
          )}
          {party && (party as Record<string, unknown>).address && (
            <div style={{ color: '#64748b', marginTop: 1 }}>{String((party as Record<string, unknown>).address)}</div>
          )}
        </div>
        {location && (
          <div style={{ textAlign: 'right', color: '#64748b' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', fontWeight: 600 }}>Location</div>
            <div style={{ marginTop: 2, color: '#334155', fontWeight: 600 }}>{String((location as Record<string, unknown>).name ?? '')}</div>
          </div>
        )}
      </div>

      {/* Line items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18, borderTop: '1px solid #e2e8f0' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #0f172a', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#334155' }}>
            <th style={{ padding: '8px 6px', textAlign: 'left' }}>Item</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Qty</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>{priceKey === 'unitCost' ? 'Unit Cost' : 'Unit Price'}</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '7px 6px' }}>
                <span style={{ fontWeight: 600 }}>{l.item?.name ?? '—'}</span>
                {l.item?.code && <span style={{ color: '#94a3b8', fontSize: 11 }}> ({(l.item as { code?: string }).code})</span>}
              </td>
              <td style={{ padding: '7px 6px', textAlign: 'right' }}>{l.quantity}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right' }}>{money(unit(l), 'PKR')}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 600 }}>{money(l.quantity * unit(l), 'PKR')}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}>No lines</td></tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <div style={{ width: 260 }}>
          <TotalsRow label="Subtotal" value={money(sub, 'PKR')} />
          {discount > 0 && <TotalsRow label="Discount" value={`- ${money(discount, 'PKR')}`} />}
          {tax > 0 && <TotalsRow label="Tax" value={money(tax, 'PKR')} />}
          <TotalsRow label="Grand total" value={money(grandTotal, 'PKR')} strong />
          {showAmountPaid && <TotalsRow label="Amount paid" value={money(amountPaid, 'PKR')} />}
          {showAmountPaid && <TotalsRow label="Balance due" value={money(balance, 'PKR')} strong />}
        </div>
      </div>

      {/* References / notes */}
      {!!detail.reference && <p style={{ color: '#64748b', marginTop: 10 }}>Reference: {String(detail.reference)}</p>}
      {!!detail.note && <p style={{ color: '#64748b', marginTop: 2 }}>Note: {String(detail.note)}</p>}

      {/* Terms / footer */}
      {(!!branding?.invoiceTerms || !!branding?.invoiceFooter) && (
        <div style={{ marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 10, fontSize: 11, color: '#64748b' }}>
          {!!branding?.invoiceTerms && <p style={{ marginBottom: 4 }}>{String(branding.invoiceTerms)}</p>}
          {!!branding?.invoiceFooter && <p>{String(branding.invoiceFooter)}</p>}
        </div>
      )}
    </div>
  );
}

function TotalsRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '5px 0',
        fontWeight: strong ? 700 : 400,
        borderTop: strong ? '2px solid #0f172a' : '1px solid #f1f5f9',
        fontSize: strong ? 14 : 12,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
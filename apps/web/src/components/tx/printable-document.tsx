'use client';

/**
 * Professional printable document template (invoice / bill / return / statement).
 *
 * Rendered into an off-screen print node and printed via an isolated iframe so
 * only the document appears (no app chrome). Styling is inline / print-only so
 * it survives isolation. The parking styles (position: fixed / left: -200vw)
 * are stripped from the copy by printElement before printing.
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { money, num, dateTime, amountInWords } from '@/lib/utils';
import type { BrandingSetting, TransactionDoc, DocLine } from '@/lib/types';

export interface PrintableDocumentProps {
  open: boolean;
  detail: TransactionDoc | null | undefined;
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
  const { data: branding } = useQuery<BrandingSetting | null>({
    queryKey: ['branding'],
    queryFn: () => apiFetch('/system/branding'),
    staleTime: Infinity,
  });

  if (!open || !detail) return null;

  const items = detail.items ?? [];
  const unit = (l: DocLine) => (priceKey === 'unitCost' ? l.unitCost ?? 0 : l.unitPrice ?? 0);
  const lineAmount = (l: DocLine) => (l.lineTotal != null ? Number(l.lineTotal) : l.quantity * unit(l));
  const party = detail.supplier ?? detail.customer ?? detail.party ?? null;
  const location = detail.stockLocation ?? detail.location ?? null;
  const paymentStatus = typeof detail.paymentStatus === 'string' ? detail.paymentStatus : undefined;

  const sub = items.reduce((s, l) => s + lineAmount(l), 0);
  const discount = Number(detail.discount ?? 0);
  const tax = Number(detail.tax ?? 0);
  const grandTotal = Number(detail.grandTotal ?? sub - discount + tax);
  const amountPaid = Number(detail.amountPaid ?? 0);
  const balance = grandTotal - (showAmountPaid ? amountPaid : 0);

  const primary = branding?.primaryColor ?? '#0f766e';
  const dark = '#0f172a';
  const muted = '#64748b';
  const lighter = '#94a3b8';
  const studio = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

  const statusColor =
    paymentStatus === 'paid' ? '#059669' : paymentStatus === 'partial' ? '#d97706' : '#dc2626';

  return (
    <div
      id="printable-document"
      style={{
        position: 'fixed',
        left: '-200vw',
        top: 0,
        width: '210mm',
        background: '#ffffff',
        color: dark,
        fontFamily: studio,
        fontSize: '12px',
        lineHeight: 1.4,
        zIndex: -1,
      }}
    >
      {/* Header / branding */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '3px solid ' + primary,
          paddingBottom: 14,
          breakInside: 'avoid',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!!branding?.logoUrl && (
            <img
              src={branding.logoUrl}
              alt=""
              style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: primary }}>
              {String(branding?.businessName ?? 'Your Business')}
            </div>
            {!!branding?.shortName && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{String(branding.shortName)}</div>}
            {!!branding?.address && <div style={{ color: muted, marginTop: 3 }}>{String(branding.address)}</div>}
            {(!!branding?.phone || !!branding?.email) && (
              <div style={{ color: muted, marginTop: 1 }}>
                {[branding.phone, branding.email].filter(Boolean).join(' · ')}
              </div>
            )}
            {!!branding?.ntn && <div style={{ color: muted, marginTop: 1 }}>NTN: {String(branding.ntn)}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>#{String(detail.number ?? detail.code ?? '')}</div>
          <div style={{ color: muted, marginTop: 2 }}>{dateTime(detail[dateField] ?? new Date())}</div>
          {location && (
            <div style={{ color: muted, marginTop: 2 }}>{location.name}</div>
          )}
          {paymentStatus && (
            <span
              style={{
                display: 'inline-block',
                marginTop: 6,
                padding: '2px 10px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: '#ffffff',
                background: statusColor,
              }}
            >
              {paymentStatus}
            </span>
          )}
        </div>
      </div>

      {/* Bill to */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, breakInside: 'avoid' }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: lighter, fontWeight: 600 }}>{partyLabel}</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{party?.name || '—'}</div>
          {party?.phone && <div style={{ color: '#475569', marginTop: 2 }}>{party.phone}</div>}
          {party?.address && <div style={{ color: muted, marginTop: 1 }}>{party.address}</div>}
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18, borderTop: '1px solid #e2e8f0' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid ' + dark, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#334155' }}>
            <th style={{ padding: '8px 6px', textAlign: 'left', width: 22 }}>#</th>
            <th style={{ padding: '8px 6px', textAlign: 'left' }}>Item</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Qty</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>{priceKey === 'unitCost' ? 'Unit Cost' : 'Unit Price'}</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Disc</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Tax</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', breakInside: 'avoid' }}>
              <td style={{ padding: '7px 6px', color: lighter }}>{i + 1}</td>
              <td style={{ padding: '7px 6px' }}>
                <span style={{ fontWeight: 600 }}>{l.item?.name ?? '—'}</span>
                {l.item?.code && <span style={{ color: lighter, fontSize: 11 }}> ({l.item.code})</span>}
              </td>
              <td style={{ padding: '7px 6px', textAlign: 'right' }}>{num(l.quantity)}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right' }}>{money(unit(l), 'PKR')}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right' }}>{Number(l.discount ?? 0) ? money(l.discount, 'PKR') : '—'}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right' }}>{Number(l.tax ?? 0) ? money(l.tax, 'PKR') : '—'}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 600 }}>{money(lineAmount(l), 'PKR')}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 12, textAlign: 'center', color: lighter }}>No lines</td></tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, breakInside: 'avoid' }}>
        <div style={{ width: 260 }}>
          <TotalsRow label="Subtotal" value={money(sub, 'PKR')} />
          {discount > 0 && <TotalsRow label="Discount" value={`- ${money(discount, 'PKR')}`} />}
          {tax > 0 && <TotalsRow label="Tax" value={money(tax, 'PKR')} />}
          <TotalsRow label="Grand total" value={money(grandTotal, 'PKR')} strong />
          {showAmountPaid && <TotalsRow label="Amount paid" value={money(amountPaid, 'PKR')} />}
          {showAmountPaid && <TotalsRow label="Balance due" value={money(balance, 'PKR')} strong />}
        </div>
      </div>

      {/* Amount in words */}
      {grandTotal > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#334155', breakInside: 'avoid' }}>
          <span style={{ fontWeight: 700 }}>Amount in words: </span>
          <span style={{ color: dark }}>{amountInWords(grandTotal)}</span>
        </div>
      )}

      {/* References / notes */}
      {!!detail.reference && <p style={{ color: muted, marginTop: 10 }}>Reference: {String(detail.reference)}</p>}
      {!!detail.note && <p style={{ color: muted, marginTop: 2 }}>Note: {String(detail.note)}</p>}

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 46, breakInside: 'avoid' }}>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: 11, color: muted }}>
            Prepared by
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: 11, color: muted }}>
            {partyLabel === 'Supplier' ? 'Received by (Supplier)' : 'Received by (Customer)'}
          </div>
        </div>
      </div>

      {/* Terms / footer */}
      {(!!branding?.invoiceTerms || !!branding?.invoiceFooter) && (
        <div style={{ marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 10, fontSize: 11, color: muted }}>
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
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}
'use client';

/**
 * Professional printable document template (invoice / bill / return / statement).
 *
 * Supports three layout presets driven by the Print Layout page:
 *   - standard: full A4 business layout (default)
 *   - compact:  tighter spacing and smaller title
 *   - thermal:  single-column 80mm receipt style for thermal printers
 * Together with Show/Hide toggles (balance due, signatures, party contact,
 * item code, discount/tax columns), logo size, font size and header alignment.
 *
 * Rendered into an off-screen print node and printed via an isolated iframe so
 * only the document appears (no app chrome). Styling is inline / print-only so
 * it survives isolation. The parking styles (position: fixed / left: -200vw)
 * are stripped from the copy by printElement before printing.
 */
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { money, num, dateTime, amountInWords } from '@/lib/utils';
import { usePrintSettings, type PrintSettings } from '@/hooks/use-print-settings';
import {
  blockFontSize,
  defaultLayout,
  resolveLayout,
  type LayoutBlockConfig,
} from '@/lib/print-layout';
import type { BrandingSetting, TransactionDoc, DocLine } from '@/lib/types';

export interface PrintableDocumentProps {
  open: boolean;
  detail: TransactionDoc | null | undefined;
  title: string;
  partyLabel: string;
  dateField: string;
  priceKey: 'unitCost' | 'unitPrice';
  showAmountPaid: boolean;
  /** Render in-flow (for an on-screen preview) instead of parked off-screen. */
  preview?: boolean;
  /** Document type for per-type footer/terms: 'sale' | 'purchase' | 'salesReturn' | 'purchaseReturn' */
  docType?: string;
  /** Override the saved print settings — used by the Print Layout live preview. */
  fmtOverride?: Partial<PrintSettings>;
}

export function PrintableDocument({
  open,
  detail,
  title,
  partyLabel,
  dateField,
  priceKey,
  showAmountPaid,
  preview = false,
  docType,
  fmtOverride,
}: PrintableDocumentProps) {
  const { data: branding } = useQuery<BrandingSetting | null>({
    queryKey: ['branding'],
    queryFn: () => apiFetch('/system/branding'),
    staleTime: Infinity,
  });

  const baseFmt = usePrintSettings();
  const fmt = fmtOverride ? { ...baseFmt, ...fmtOverride } : baseFmt;

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

  const docFooter = (() => {
    if (!docType) return branding?.invoiceFooter ?? '';
    const key = docType + 'Footer' as keyof BrandingSetting;
    return (branding?.[key] as string) || branding?.invoiceFooter || '';
  })();
  const docTerms = (() => {
    if (!docType) return branding?.invoiceTerms ?? '';
    const key = docType + 'Terms' as keyof BrandingSetting;
    return (branding?.[key] as string) || branding?.invoiceTerms || '';
  })();

  // ---- Layout derived from Print Layout settings -------------------------
  const template = fmt.invoiceTemplate;
  const thermal = template === 'thermal';
  const tight = template === 'compact';
  const centerAlign = fmt.invoiceHeaderAlign === 'center' || thermal;

  const fz = fmt.fontSize === 'small' ? 0.9 : fmt.fontSize === 'large' ? 1.1 : 1;
  const font = (px: number) => `${Math.round(px * fz)}px`;
  const logoPx = fmt.logoSize === 'small' ? 34 : fmt.logoSize === 'large' ? 72 : 52;

  const showNumCol = !thermal;
  const colCount =
    (showNumCol ? 1 : 0) + 1 + 1 + 1 + (fmt.invoiceShowDiscountCol ? 1 : 0) + (fmt.invoiceShowTaxCol ? 1 : 0) + 1;

  const parkedWidth = thermal
    ? '80mm'
    : fmt.paperSize === 'A5'
      ? '148mm'
      : fmt.paperSize === 'Letter'
        ? '216mm'
        : '210mm';

  const rowPad = thermal ? '5px 3px' : tight ? '5px 4px' : '7px 6px';
  const headPad = thermal ? '4px 3px' : tight ? '5px 4px' : '8px 6px';

  const containerId = preview ? 'printable-document-preview' : 'printable-document';
  const containerStyle = preview
    ? {
        width: thermal ? '302px' : '794px',
        maxWidth: '100%',
        background: '#ffffff',
        color: dark,
        fontFamily: studio,
        fontSize: font(thermal ? 9 : 12),
        lineHeight: thermal ? 1.35 : 1.4,
        boxShadow: '0 1px 6px rgba(15, 23, 42, .12)',
      }
    : {
        position: 'fixed' as const,
        left: '-200vw',
        top: 0,
        width: parkedWidth,
        background: '#ffffff',
        color: dark,
        fontFamily: studio,
        fontSize: font(thermal ? 9 : 12),
        lineHeight: thermal ? 1.35 : 1.4,
        zIndex: -1,
      };

  // ---- Custom (Designer) layout ------------------------------------------
  if (template === 'custom') {
    const layout = resolveLayout(
      fmt.customLayout ?? defaultLayout(),
      fmt.customLayoutOverrides,
      docType,
      location?.id ?? null,
    );
    const blocks = layout.blocks.filter((b) => b.enabled);
    const bs = (cfg: LayoutBlockConfig) => Math.round(blockFontSize(cfg) * fz);

    const Box = ({ cfg, children }: { cfg: LayoutBlockConfig; children: ReactNode }) => (
      <div
        style={{
          marginTop: cfg.marginTop,
          textAlign: cfg.align,
          position: 'relative',
          left: cfg.offsetX,
          breakInside: 'avoid',
        }}
      >
        {children}
      </div>
    );

    const showNumCol = true;
    const colCount = 1 + 1 + 1 + 1 + (fmt.invoiceShowDiscountCol ? 1 : 0) + (fmt.invoiceShowTaxCol ? 1 : 0) + 1;

    return (
      <div id={containerId} style={containerStyle}>
        {blocks.map((cfg) => {
          switch (cfg.key) {
            case 'logo':
              return branding?.logoUrl ? (
                <Box key={cfg.key} cfg={cfg}>
                  <img src={branding.logoUrl} alt="" style={{ height: Math.max(32, bs(cfg)), maxWidth: '45%', objectFit: 'contain' }} />
                </Box>
              ) : null;
            case 'businessName':
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ fontSize: bs(cfg), fontWeight: cfg.bold ? 700 : 600, color: primary }}>
                    {String(branding?.businessName ?? 'Your Business')}
                  </div>
                </Box>
              );
            case 'businessContact':
              return (
                <Box key={cfg.key} cfg={cfg}>
                  {!!branding?.shortName && <div style={{ color: muted }}>{String(branding.shortName)}</div>}
                  {!!branding?.address && <div style={{ color: muted }}>{String(branding.address)}</div>}
                  {(!!branding?.phone || !!branding?.email) && (
                    <div style={{ color: muted }}>{[branding.phone, branding.email].filter(Boolean).join(' · ')}</div>
                  )}
                  {!!branding?.ntn && <div style={{ color: muted }}>NTN: {String(branding.ntn)}</div>}
                </Box>
              );
            case 'invoiceTitle':
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ fontSize: bs(cfg), fontWeight: cfg.bold ? 800 : 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {title}
                  </div>
                </Box>
              );
            case 'invoiceMeta':
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ fontWeight: 600 }}>#{String(detail.number ?? detail.code ?? '')}</div>
                  {fmt.invoiceShowDate && <div style={{ color: muted }}>{dateTime(detail[dateField] ?? new Date())}</div>}
                  {location && <div style={{ color: muted }}>{location.name}</div>}
                  {paymentStatus && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 4,
                        padding: '2px 10px',
                        borderRadius: 999,
                        fontSize: font(9),
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
                </Box>
              );
            case 'party':
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ fontSize: font(9), textTransform: 'uppercase', letterSpacing: 1, color: lighter, fontWeight: 600 }}>
                    {partyLabel}
                  </div>
                  <div style={{ fontSize: bs(cfg), fontWeight: cfg.bold ? 700 : 600, marginTop: 2 }}>
                    {party?.name || '—'}
                  </div>
                  {fmt.invoiceShowPartyContact && party?.phone && <div style={{ color: '#475569' }}>{party.phone}</div>}
                  {fmt.invoiceShowPartyContact && party?.address && <div style={{ color: muted }}>{party.address}</div>}
                </Box>
              );
            case 'itemsTable':
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '1px solid #e2e8f0' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid ' + dark, fontSize: Math.round(10 * fz), textTransform: 'uppercase', letterSpacing: 1, color: '#334155' }}>
                        {showNumCol && <th style={{ padding: headPad, textAlign: 'left', width: 22 }}>#</th>}
                        <th style={{ padding: headPad, textAlign: 'left' }}>Item</th>
                        <th style={{ padding: headPad, textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: headPad, textAlign: 'right' }}>{priceKey === 'unitCost' ? 'Unit Cost' : 'Rate'}</th>
                        {fmt.invoiceShowDiscountCol && <th style={{ padding: headPad, textAlign: 'right' }}>Disc</th>}
                        {fmt.invoiceShowTaxCol && <th style={{ padding: headPad, textAlign: 'right' }}>Tax</th>}
                        <th style={{ padding: headPad, textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((l, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', breakInside: 'avoid', fontSize: bs(cfg) }}>
                          {showNumCol && <td style={{ padding: rowPad, color: lighter }}>{i + 1}</td>}
                          <td style={{ padding: rowPad }}>
                            <span style={{ fontWeight: 600 }}>{l.item?.name ?? '—'}</span>
                            {fmt.invoiceShowItemCode && l.item?.code && (
                              <span style={{ color: lighter, fontSize: Math.round(bs(cfg) * 0.85) }}> ({l.item.code})</span>
                            )}
                          </td>
                          <td style={{ padding: rowPad, textAlign: 'right' }}>{num(l.quantity)}</td>
                          <td style={{ padding: rowPad, textAlign: 'right' }}>{money(unit(l), 'PKR')}</td>
                          {fmt.invoiceShowDiscountCol && <td style={{ padding: rowPad, textAlign: 'right' }}>{Number(l.discount ?? 0) ? money(l.discount, 'PKR') : '—'}</td>}
                          {fmt.invoiceShowTaxCol && <td style={{ padding: rowPad, textAlign: 'right' }}>{Number(l.tax ?? 0) ? money(l.tax, 'PKR') : '—'}</td>}
                          <td style={{ padding: rowPad, textAlign: 'right', fontWeight: 600 }}>{money(lineAmount(l), 'PKR')}</td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr><td colSpan={colCount} style={{ padding: 12, textAlign: 'center', color: lighter }}>No lines</td></tr>
                      )}
                    </tbody>
                  </table>
                </Box>
              );
            case 'totals':
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ display: 'inline-block', minWidth: 240, textAlign: 'left' }}>
                    <TotalsRow label="Subtotal" value={money(sub, 'PKR')} fz={fz} thermal={false} base={bs(cfg)} />
                    {discount > 0 && <TotalsRow label="Discount" value={`- ${money(discount, 'PKR')}`} fz={fz} thermal={false} base={bs(cfg)} />}
                    {tax > 0 && <TotalsRow label="Tax" value={money(tax, 'PKR')} fz={fz} thermal={false} base={bs(cfg)} />}
                    <TotalsRow label="Grand total" value={money(grandTotal, 'PKR')} strong fz={fz} thermal={false} base={bs(cfg)} />
                    {showAmountPaid && <TotalsRow label="Amount paid" value={money(amountPaid, 'PKR')} fz={fz} thermal={false} base={bs(cfg)} />}
                    {showAmountPaid && fmt.invoiceShowBalance && <TotalsRow label="Balance due" value={money(balance, 'PKR')} strong fz={fz} thermal={false} base={bs(cfg)} />}
                  </div>
                </Box>
              );
            case 'amountWords':
              if (grandTotal <= 0 || !fmt.invoiceShowAmountWords) return null;
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ color: '#334155' }}>
                    <span style={{ fontWeight: 700 }}>Amount in words: </span>
                    {amountInWords(grandTotal)}
                  </div>
                </Box>
              );
            case 'notes':
              if (!detail.reference && !detail.note) return null;
              return (
                <Box key={cfg.key} cfg={cfg}>
                  {!!detail.reference && <p style={{ color: muted, margin: 0, fontSize: bs(cfg) }}>Reference: {String(detail.reference)}</p>}
                  {!!detail.note && <p style={{ color: muted, marginTop: 2, fontSize: bs(cfg) }}>Note: {String(detail.note)}</p>}
                </Box>
              );
            case 'signatures':
              if (!fmt.invoiceShowSignatures) return null;
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ textAlign: 'center', width: '45%' }}>
                      <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: bs(cfg), color: muted }}>Prepared by</div>
                    </div>
                    <div style={{ textAlign: 'center', width: '45%' }}>
                      <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: bs(cfg), color: muted }}>
                        {partyLabel === 'Supplier' ? 'Received by (Supplier)' : 'Received by (Customer)'}
                      </div>
                    </div>
                  </div>
                </Box>
              );
            case 'termsFooter':
              if (!docTerms && !docFooter) return null;
              return (
                <Box key={cfg.key} cfg={cfg}>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, fontSize: bs(cfg), color: muted }}>
                    {!!docTerms && <p style={{ margin: 0, marginBottom: 4 }}>{docTerms}</p>}
                    {!!docFooter && <p style={{ margin: 0 }}>{docFooter}</p>}
                  </div>
                </Box>
              );
            default:
              return null;
          }
        })}
      </div>
    );
  }

  return (
    <div
      id={containerId}
      style={containerStyle}
    >
      {/* Header / branding */}
      <div
        style={{
          display: 'flex',
          borderBottom: thermal ? '1px dashed ' + primary : '3px solid ' + primary,
          paddingBottom: thermal ? 8 : 14,
          breakInside: 'avoid',
          ...(centerAlign
            ? { flexDirection: 'column', alignItems: 'center' }
            : { justifyContent: 'space-between', alignItems: 'flex-start' }),
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            ...(centerAlign ? { flexDirection: 'column', textAlign: 'center' } : {}),
          }}
        >
          {!!branding?.logoUrl && (
            <img
              src={branding.logoUrl}
              alt=""
              style={{ width: logoPx, height: logoPx, objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{ fontSize: font(thermal ? 14 : 22), fontWeight: 700, color: primary }}>
              {String(branding?.businessName ?? 'Your Business')}
            </div>
            {!!branding?.shortName && <div style={{ fontSize: font(11), color: muted, marginTop: 2 }}>{String(branding.shortName)}</div>}
            {!!branding?.address && <div style={{ color: muted, marginTop: 3 }}>{String(branding.address)}</div>}
            {(!!branding?.phone || !!branding?.email) && (
              <div style={{ color: muted, marginTop: 1 }}>
                {[branding.phone, branding.email].filter(Boolean).join(' · ')}
              </div>
            )}
            {!!branding?.ntn && <div style={{ color: muted, marginTop: 1 }}>NTN: {String(branding.ntn)}</div>}
          </div>
        </div>
        <div
          style={{
            ...(centerAlign ? { marginTop: 8, textAlign: 'center' } : { textAlign: 'right' }),
          }}
        >
          <div style={{ fontSize: font(thermal ? 13 : 18), fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: font(thermal ? 11 : 13), fontWeight: 600 }}>#{String(detail.number ?? detail.code ?? '')}</div>
          {fmt.invoiceShowDate && <div style={{ color: muted, marginTop: 2 }}>{dateTime(detail[dateField] ?? new Date())}</div>}
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
                fontSize: font(9),
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
      <div
        style={{
          display: 'flex',
          justifyContent: centerAlign ? 'center' : 'space-between',
          marginTop: thermal ? 10 : 16,
          breakInside: 'avoid',
          ...(centerAlign ? { textAlign: 'center' } : {}),
        }}
      >
        <div>
          <div style={{ fontSize: font(9), textTransform: 'uppercase', letterSpacing: 1, color: lighter, fontWeight: 600 }}>{partyLabel}</div>
          <div style={{ fontSize: font(thermal ? 11 : 14), fontWeight: 700, marginTop: 2 }}>{party?.name || '—'}</div>
          {fmt.invoiceShowPartyContact && party?.phone && <div style={{ color: '#475569', marginTop: 2 }}>{party.phone}</div>}
          {fmt.invoiceShowPartyContact && party?.address && <div style={{ color: muted, marginTop: 1 }}>{party.address}</div>}
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: thermal ? 10 : 18, borderTop: '1px solid #e2e8f0' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid ' + dark, fontSize: font(thermal ? 7 : 10), textTransform: 'uppercase', letterSpacing: 1, color: '#334155' }}>
            {showNumCol && <th style={{ padding: headPad, textAlign: 'left', width: 22 }}>#</th>}
            <th style={{ padding: headPad, textAlign: 'left' }}>Item</th>
            <th style={{ padding: headPad, textAlign: 'right' }}>Qty</th>
            <th style={{ padding: headPad, textAlign: 'right' }}>{priceKey === 'unitCost' ? 'Unit Cost' : 'Rate'}</th>
            {fmt.invoiceShowDiscountCol && <th style={{ padding: headPad, textAlign: 'right' }}>Disc</th>}
            {fmt.invoiceShowTaxCol && <th style={{ padding: headPad, textAlign: 'right' }}>Tax</th>}
            <th style={{ padding: headPad, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', breakInside: 'avoid' }}>
              {showNumCol && <td style={{ padding: rowPad, color: lighter }}>{i + 1}</td>}
              <td style={{ padding: rowPad }}>
                <span style={{ fontWeight: 600 }}>{l.item?.name ?? '—'}</span>
                {fmt.invoiceShowItemCode && l.item?.code && (
                  thermal
                    ? <span style={{ display: 'block', color: lighter, fontSize: font(8) }}>{l.item.code}</span>
                    : <span style={{ color: lighter, fontSize: font(10) }}> ({l.item.code})</span>
                )}
              </td>
              <td style={{ padding: rowPad, textAlign: 'right' }}>{num(l.quantity)}</td>
              <td style={{ padding: rowPad, textAlign: 'right' }}>{money(unit(l), 'PKR')}</td>
              {fmt.invoiceShowDiscountCol && <td style={{ padding: rowPad, textAlign: 'right' }}>{Number(l.discount ?? 0) ? money(l.discount, 'PKR') : '—'}</td>}
              {fmt.invoiceShowTaxCol && <td style={{ padding: rowPad, textAlign: 'right' }}>{Number(l.tax ?? 0) ? money(l.tax, 'PKR') : '—'}</td>}
              <td style={{ padding: rowPad, textAlign: 'right', fontWeight: 600 }}>{money(lineAmount(l), 'PKR')}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={colCount} style={{ padding: 12, textAlign: 'center', color: lighter }}>No lines</td></tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: thermal ? 8 : 14, breakInside: 'avoid' }}>
        <div style={{ width: thermal ? '100%' : tight ? 230 : 260 }}>
          <TotalsRow label="Subtotal" value={money(sub, 'PKR')} fz={fz} thermal={thermal} />
          {discount > 0 && <TotalsRow label="Discount" value={`- ${money(discount, 'PKR')}`} fz={fz} thermal={thermal} />}
          {tax > 0 && <TotalsRow label="Tax" value={money(tax, 'PKR')} fz={fz} thermal={thermal} />}
          <TotalsRow label="Grand total" value={money(grandTotal, 'PKR')} strong fz={fz} thermal={thermal} />
          {showAmountPaid && <TotalsRow label="Amount paid" value={money(amountPaid, 'PKR')} fz={fz} thermal={thermal} />}
          {showAmountPaid && fmt.invoiceShowBalance && <TotalsRow label="Balance due" value={money(balance, 'PKR')} strong fz={fz} thermal={thermal} />}
        </div>
      </div>

      {/* Amount in words */}
      {grandTotal > 0 && fmt.invoiceShowAmountWords && (
        <div style={{ marginTop: 10, fontSize: font(thermal ? 8 : 11), color: '#334155', breakInside: 'avoid' }}>
          <span style={{ fontWeight: 700 }}>Amount in words: </span>
          <span style={{ color: dark }}>{amountInWords(grandTotal)}</span>
        </div>
      )}

      {/* Payment terms */}
      {showAmountPaid && balance > 0 && fmt.invoiceShowBalance && (
        <div style={{ marginTop: 4, fontSize: font(thermal ? 8 : 11), color: '#475569', breakInside: 'avoid' }}>
          Payment status: <b style={{ textTransform: 'uppercase' }}>{paymentStatus ?? 'unpaid'}</b> — balance of{' '}
          {money(balance, 'PKR')} is due.
        </div>
      )}

      {/* References / notes */}
      {!!detail.reference && <p style={{ color: muted, marginTop: 10, fontSize: font(10) }}>Reference: {String(detail.reference)}</p>}
      {!!detail.note && <p style={{ color: muted, marginTop: 2, fontSize: font(10) }}>Note: {String(detail.note)}</p>}

      {/* Signatures */}
      {fmt.invoiceShowSignatures && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: thermal ? 28 : 46, breakInside: 'avoid' }}>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: font(10), color: muted }}>
              Prepared by
            </div>
          </div>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 6, fontSize: font(10), color: muted }}>
              {partyLabel === 'Supplier' ? 'Received by (Supplier)' : 'Received by (Customer)'}
            </div>
          </div>
        </div>
      )}

      {/* Terms / footer */}
      {(!!docTerms || !!docFooter) && (
        <div style={{ marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 10, fontSize: font(10), color: muted }}>
          {!!docTerms && <p style={{ marginBottom: 4 }}>{docTerms}</p>}
          {!!docFooter && <p>{docFooter}</p>}
        </div>
      )}
    </div>
  );
}

function TotalsRow({
  label,
  value,
  strong,
  fz,
  thermal,
  base,
}: {
  label: string;
  value: string;
  strong?: boolean;
  fz: number;
  thermal: boolean;
  base?: number;
}) {
  const size = base ?? (strong ? 14 : 12) * fz;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: thermal ? '3px 0' : '5px 0',
        fontWeight: strong ? 700 : 400,
        borderTop: strong ? '2px solid #0f172a' : '1px solid #f1f5f9',
        fontSize: `${Math.round(size)}px`,
      }}
    >
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}
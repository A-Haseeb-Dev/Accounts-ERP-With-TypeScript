/**
 * Custom print layout model.
 *
 * A custom layout is an ordered list of blocks. The order of the list is the
 * vertical order on the document. Each block can be positioned pixel-by-pixel:
 *  - align     left / center / right
 *  - offsetX   horizontal shift in px (negative moves left, positive right)
 *  - marginTop vertical gap above the block in px
 *  - fontSize  font size in px for the block (0 = use the block default)
 *  - bold      applies a bolder weight where the block is text
 *
 * Stored in the settings table under `print.layout` as a JSON string.
 */

export type LayoutBlockAlign = 'left' | 'center' | 'right';

export type LayoutBlockKey =
  | 'logo'
  | 'businessName'
  | 'businessContact'
  | 'invoiceTitle'
  | 'invoiceMeta'
  | 'party'
  | 'itemsTable'
  | 'totals'
  | 'amountWords'
  | 'notes'
  | 'signatures'
  | 'termsFooter';

export interface LayoutBlockConfig {
  key: LayoutBlockKey;
  enabled: boolean;
  align: LayoutBlockAlign;
  /** Horizontal shift in px (-80..80). */
  offsetX: number;
  /** Vertical gap above the block in px (0..60). */
  marginTop: number;
  /** Font size in px (0 = block default). */
  fontSize: number;
  bold: boolean;
}

export interface PrintLayoutConfig {
  blocks: LayoutBlockConfig[];
}

export const LAYOUT_BLOCK_LABELS: Record<LayoutBlockKey, string> = {
  logo: 'Logo',
  businessName: 'Business Name',
  businessContact: 'Business Contact',
  invoiceTitle: 'Invoice Title',
  invoiceMeta: 'Invoice # / Date / Status',
  party: 'Party / Bill To',
  itemsTable: 'Items Table',
  totals: 'Totals',
  amountWords: 'Amount in Words',
  notes: 'Notes & Reference',
  signatures: 'Signature Lines',
  termsFooter: 'Terms & Footer',
};

export const LAYOUT_BLOCK_ORDER: LayoutBlockKey[] = [
  'logo',
  'businessName',
  'businessContact',
  'invoiceTitle',
  'invoiceMeta',
  'party',
  'itemsTable',
  'totals',
  'amountWords',
  'notes',
  'signatures',
  'termsFooter',
];

export function defaultLayout(): PrintLayoutConfig {
  const b = (
    key: LayoutBlockKey,
    cfg: Partial<Omit<LayoutBlockConfig, 'key'>> = {},
  ): LayoutBlockConfig => ({
    key,
    enabled: true,
    align: 'left',
    offsetX: 0,
    marginTop: 0,
    fontSize: 0,
    bold: false,
    ...cfg,
  });

  return {
    blocks: [
      b('logo', { align: 'left', fontSize: 0 }),
      b('businessName', { align: 'left', fontSize: 21, bold: true }),
      b('businessContact', { marginTop: 2, fontSize: 11 }),
      b('invoiceTitle', { align: 'center', marginTop: 14, fontSize: 17, bold: true }),
      b('invoiceMeta', { align: 'center', marginTop: 6, fontSize: 12 }),
      b('party', { marginTop: 14, fontSize: 13 }),
      b('itemsTable', { marginTop: 10, fontSize: 12 }),
      b('totals', { align: 'right', marginTop: 10, fontSize: 14 }),
      b('amountWords', { marginTop: 10, fontSize: 11 }),
      b('notes', { marginTop: 8, fontSize: 10 }),
      b('signatures', { marginTop: 42, fontSize: 10 }),
      b('termsFooter', { marginTop: 18, fontSize: 10 }),
    ],
  };
}

/** Block default font size when the config says 0. */
export function blockFontSize(block: LayoutBlockConfig): number {
  if (block.fontSize > 0) return block.fontSize;
  switch (block.key) {
    case 'businessName':
      return 21;
    case 'businessContact':
    case 'notes':
    case 'termsFooter':
      return 11;
    case 'invoiceTitle':
      return 17;
    case 'invoiceMeta':
      return 12;
    case 'itemsTable':
      return 12;
    case 'amountWords':
      return 11;
    case 'party':
      return 13;
    case 'totals':
      return 14;
    case 'signatures':
      return 10;
    default:
      return 12;
  }
}

export function encodePrintLayout(layout: PrintLayoutConfig): string {
  return JSON.stringify(layout);
}

export function decodePrintLayout(raw: string | undefined | null): PrintLayoutConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { blocks?: unknown };
    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) return null;

    const allowed = new Set<LayoutBlockKey>(LAYOUT_BLOCK_ORDER);
    const blocks: LayoutBlockConfig[] = [];
    for (const rawBlock of parsed.blocks) {
      if (!rawBlock || typeof rawBlock !== 'object') continue;
      const maybe = rawBlock as Record<string, unknown>;
      const key = maybe.key as LayoutBlockKey;
      if (!allowed.has(key)) continue;
      const num = (v: unknown, fallback: number) =>
        typeof v === 'number' && Number.isFinite(v) ? v : fallback;
      blocks.push({
        key,
        enabled: maybe.enabled !== false,
        align: maybe.align === 'center' || maybe.align === 'right' ? maybe.align : 'left',
        offsetX: Math.max(-120, Math.min(120, num(maybe.offsetX, 0))),
        marginTop: Math.max(0, Math.min(60, num(maybe.marginTop, 0))),
        fontSize: Math.max(0, Math.min(36, num(maybe.fontSize, 0))),
        bold: maybe.bold === true,
      });
    }

    // Make sure every block exists in the returned layout (missing ones get
    // their defaults) so a corrupt/older saved layout still renders fully.
    const seen = new Set(blocks.map((cb) => cb.key));
    const missing = defaultLayout().blocks.filter((cb) => !seen.has(cb.key));
    return { blocks: [...missing, ...blocks] };
  } catch {
    return null;
  }
}

export function normalizeLayout(raw: string | undefined | null): PrintLayoutConfig {
  return decodePrintLayout(raw) ?? defaultLayout();
}
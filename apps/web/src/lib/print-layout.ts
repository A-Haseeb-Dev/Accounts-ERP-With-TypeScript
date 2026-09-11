/**
 * Custom print layout model.
 *
 * A custom layout is an absolute-positioned page: every block (logo, business
 * name, title, party, items table, totals, …) has an (x, y) position in pixels
 * measured from the top-left of the page canvas, plus optional width. You drag
 * blocks anywhere on the designer canvas and fine-tune with exact pixel values.
 *
 * Extra per-block properties:
 *  - align     left / center / right (aligns the text inside the block box)
 *  - fontSize  font size in px (0 = use the block default)
 *  - bold      applies a bolder weight where the block is text
 *  - width     box width in px (0 = auto; items table spans the page width)
 *  - height    box height in px (0 = auto: sized by the content)
 *  - padding   internal padding in px around the block content (e.g. logo inset)
 *
 * Legacy layouts saved as a vertical "flow" list (marginTop / offsetX / align)
 * are migrated to absolute coordinates on decode, so existing data still works.
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
  /** Legacy: horizontal shift in px for old flow-style layouts. */
  offsetX: number;
  /** Legacy: vertical gap above the block for old flow-style layouts. */
  marginTop: number;
  /** Font size in px (0 = block default). */
  fontSize: number;
  bold: boolean;
  /** Absolute left position in px within the page canvas. */
  x: number;
  /** Absolute top position in px within the page canvas. */
  y: number;
  /** Box width in px (0 = auto; items table spans the page width). */
  width: number;
  /** Box height in px (0 = auto: sized by the content). */
  height: number;
  /** Internal padding in px inside the block box (e.g. logo inset). */
  padding: number;
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

/** Designer canvas widths (px) for each paper size. 794px ≈ 210mm (A4). */
export const PAPER_PX_WIDTH: Record<string, number> = {
  A4: 794,
  A5: 559,
  Letter: 816,
  thermal: 302,
};

/** Designer canvas heights (px) for each fixed paper size. Thermal is a
 * continuous strip, so its height is defined by the content on the page. */
export const PAPER_PX_HEIGHT: Record<string, number> = {
  A4: 1123,
  A5: 794,
  Letter: 1056,
};

export function paperPxFor(paperSize: string | undefined, thermal: boolean): number {
  if (thermal) return PAPER_PX_WIDTH.thermal;
  return PAPER_PX_WIDTH[paperSize ?? 'A4'] ?? PAPER_PX_WIDTH.A4;
}

/** Height of a fixed-size page in designer px; `null` for the continuous
 * thermal strip (canvas height is then driven by the block content). */
export function paperPxHeightFor(paperSize: string | undefined, thermal: boolean): number | null {
  if (thermal) return null;
  return PAPER_PX_HEIGHT[paperSize ?? 'A4'] ?? PAPER_PX_HEIGHT.A4;
}

/** Default box width (px) used when a block's width is 0 (auto). */
export function estimateBlockWidth(key: LayoutBlockKey): number {
  switch (key) {
    case 'itemsTable':
      return 0; // spans the full page width
    case 'logo':
      return 120;
    case 'businessName':
      return 320;
    case 'businessContact':
      return 420;
    case 'invoiceTitle':
      return 320;
    case 'invoiceMeta':
      return 300;
    case 'party':
      return 300;
    case 'totals':
      return 250;
    case 'notes':
    case 'amountWords':
    case 'termsFooter':
      return 420;
    case 'signatures':
      return 500;
    default:
      return 300;
  }
}

/** Approximate rendered height (px) used by the canvas and legacy migration. */
export function estimateBlockHeight(key: LayoutBlockKey): number {
  switch (key) {
    case 'logo':
      return 60;
    case 'businessName':
      return 30;
    case 'businessContact':
      return 70;
    case 'invoiceTitle':
      return 26;
    case 'invoiceMeta':
      return 78;
    case 'party':
      return 88;
    case 'itemsTable':
      return 200;
    case 'totals':
      return 150;
    case 'amountWords':
      return 36;
    case 'notes':
      return 44;
    case 'signatures':
      return 72;
    case 'termsFooter':
      return 64;
    default:
      return 40;
  }
}

/**
 * Effective rendered height (px) of a block: its explicit `height` when set,
 * otherwise the default. The items table grows with its number of rows. The
 * block's padding is added on top so the canvas box matches the real footprint.
 */
export function layoutBlockHeight(cfg: LayoutBlockConfig, rows = 0): number {
  const pad = (cfg.padding || 0) * 2;
  if (cfg.height > 0) return Math.round(cfg.height + pad);
  const base =
    cfg.key === 'itemsTable'
      ? 40 + Math.max(rows, 1) * 26
      : estimateBlockHeight(cfg.key);
  return Math.round(base + pad);
}

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

const clampNum = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(v)));

type AbsoluteableBlock = Omit<LayoutBlockConfig, 'x' | 'y'> & { x?: number; y?: number };

/**
 * Turn a flow-style block list into absolute coordinates. Blocks that already
 * carry x/y are kept; the rest are laid out top-down using their legacy
 * marginTop / offsetX / align properties.
 */
export function withAbsoluteCoordinates(blocks: AbsoluteableBlock[]): LayoutBlockConfig[] {
  const WP = PAPER_PX_WIDTH.A4;
  let cursor = 0;
  return blocks.map((b) => {
    const defW = b.key === 'itemsTable' ? 0 : estimateBlockWidth(b.key);
    const defH = estimateBlockHeight(b.key);
    const w = b.width > 0 ? b.width : defW;
    let x = b.x;
    let y = b.y;
    if (typeof x !== 'number' || typeof y !== 'number') {
      const alignX =
        b.align === 'center' ? Math.round((WP - w) / 2) : b.align === 'right' ? WP - w : 0;
      x = alignX + (b.offsetX || 0);
      y = cursor + (b.marginTop || 0);
    }
    cursor = Math.max(cursor, y + defH + 8);
    return {
      ...b,
      width: b.key === 'itemsTable' ? 0 : w,
      x: clampNum(x, -600, 1600),
      y: clampNum(y, -600, 2400),
    };
  });
}

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
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    padding: 0,
    ...cfg,
  });

  const flow: LayoutBlockConfig[] = [
    b('logo'),
    b('businessName', { marginTop: 4, fontSize: 21, bold: true }),
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
  ];

  return { blocks: withAbsoluteCoordinates(flow) };
}

export function encodePrintLayout(layout: PrintLayoutConfig): string {
  return JSON.stringify(layout);
}

export function decodePrintLayout(raw: string | undefined | null): PrintLayoutConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { blocks?: unknown };
    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) return null;

    // A layout is treated as absolute if any saved block carries x/y.
    const hasExplicit = parsed.blocks.some((rb) => {
      if (!rb || typeof rb !== 'object') return false;
      const r = rb as Record<string, unknown>;
      return typeof r.x === 'number' && typeof r.y === 'number';
    });

    const allowed = new Set<LayoutBlockKey>(LAYOUT_BLOCK_ORDER);
    type ParsedBlock = Omit<LayoutBlockConfig, 'x' | 'y'> & { x?: number; y?: number };
    const blocks: ParsedBlock[] = [];
    for (const rawBlock of parsed.blocks) {
      if (!rawBlock || typeof rawBlock !== 'object') continue;
      const maybe = rawBlock as Record<string, unknown>;
      const key = maybe.key as LayoutBlockKey;
      if (!allowed.has(key)) continue;
      const num = (v: unknown, fallback: number) =>
        typeof v === 'number' && Number.isFinite(v) ? v : fallback;
      const block: ParsedBlock = {
        key,
        enabled: maybe.enabled !== false,
        align: maybe.align === 'center' || maybe.align === 'right' ? maybe.align : 'left',
        offsetX: clampNum(num(maybe.offsetX, 0), -120, 120),
        marginTop: clampNum(num(maybe.marginTop, 0), 0, 60),
        fontSize: clampNum(num(maybe.fontSize, 0), 0, 36),
        bold: maybe.bold === true,
        width: clampNum(num(maybe.width, 0), 0, 1200),
        height: clampNum(num(maybe.height, 0), 0, 2000),
        padding: clampNum(num(maybe.padding, 0), 0, 120),
      };
      if (typeof maybe.x === 'number') block.x = clampNum(maybe.x, -600, 1600);
      if (typeof maybe.y === 'number') block.y = clampNum(maybe.y, -600, 2400);
      blocks.push(block);
    }

    // Make sure every block exists in the returned layout (missing ones get
    // their defaults) so a corrupt/older saved layout still renders fully.
    const seen = new Set(blocks.map((cb) => cb.key));
    const missing = defaultLayout().blocks.filter((cb) => !seen.has(cb.key));
    const assembled: AbsoluteableBlock[] = [...missing, ...blocks];

    // Existing absolute-positioned layouts are kept as-is; legacy flow layouts
    // are converted to absolute coordinates.
    return hasExplicit
      ? { blocks: assembled.map((cb) => ({ ...cb, x: cb.x ?? 0, y: cb.y ?? 0 })) }
      : { blocks: withAbsoluteCoordinates(assembled) };
  } catch {
    return null;
  }
}

export function normalizeLayout(raw: string | undefined | null): PrintLayoutConfig {
  return decodePrintLayout(raw) ?? defaultLayout();
}

// ---------------------------------------------------------------------------
// Per-scope layout overrides
//
// On top of the base layout (`print.layout`) you can override the layout for a
// specific document type (sale / purchase / salesReturn / purchaseReturn) and
// optionally a specific warehouse/stock location. The overrides map lives in
// the settings table under `print.layoutOverrides` as a JSON string of the
// shape:
//
//   { "<docType>": { "<warehouseId>": "<layout JSON>", "*": "<layout JSON>" } }
//
// A warehouse key of "*" applies to every warehouse of that document type.
// Resolution precedence when printing:
//   1. overrides[docType][warehouseId]
//   2. overrides[docType]["*"]
//   3. the base layout
// ---------------------------------------------------------------------------

export const PRINT_DOC_TYPES = [
  { value: 'sale', label: 'Sales Invoices' },
  { value: 'purchase', label: 'Purchase Bills' },
  { value: 'salesReturn', label: 'Sales Returns' },
  { value: 'purchaseReturn', label: 'Purchase Returns' },
] as const;

export type PrintDocType = (typeof PRINT_DOC_TYPES)[number]['value'];

/** overrides[docType][warehouseId] → layout; "*" = all warehouses of the doc type. */
export interface PrintLayoutOverrides {
  [docType: string]: Record<string, PrintLayoutConfig>;
}

export function encodeLayoutOverrides(overrides: PrintLayoutOverrides): string {
  const out: Record<string, Record<string, string>> = {};
  for (const docType of Object.keys(overrides)) {
    out[docType] = {};
    for (const scopeKey of Object.keys(overrides[docType])) {
      out[docType][scopeKey] = encodePrintLayout(overrides[docType][scopeKey]);
    }
  }
  return JSON.stringify(out);
}

export function decodeLayoutOverrides(raw: string | undefined | null): PrintLayoutOverrides {
  if (!raw) return {};
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const out: PrintLayoutOverrides = {};
  for (const docType of Object.keys(parsed)) {
    const byWh = parsed[docType];
    if (!byWh || typeof byWh !== 'object') continue;
    const map: Record<string, PrintLayoutConfig> = {};
    for (const scopeKey of Object.keys(byWh as Record<string, unknown>)) {
      const rawLayout = (byWh as Record<string, unknown>)[scopeKey];
      if (typeof rawLayout !== 'string') continue;
      const decoded = decodePrintLayout(rawLayout);
      if (decoded) map[scopeKey] = decoded;
    }
    if (Object.keys(map).length > 0) out[docType] = map;
  }
  return out;
}

/**
 * The most specific override for (docType, warehouseId), or null when none.
 * "*" matches any warehouse of that document type.
 */
export function getLayoutOverride(
  overrides: PrintLayoutOverrides,
  docType: string | undefined | null,
  warehouseId: string | null,
): PrintLayoutConfig | null {
  if (!docType) return null;
  const byDoc = overrides?.[docType];
  if (!byDoc) return null;
  if (warehouseId && byDoc[warehouseId]) return byDoc[warehouseId];
  return byDoc['*'] ?? null;
}

/** The effective layout for a document: override if present, else the base. */
export function resolveLayout(
  base: PrintLayoutConfig,
  overrides: PrintLayoutOverrides,
  docType: string | undefined | null,
  warehouseId: string | null,
): PrintLayoutConfig {
  return getLayoutOverride(overrides, docType, warehouseId) ?? base;
}

// ---------------------------------------------------------------------------
// Named layout presets
//
// A named format is a full snapshot of the print designer: every field value
// (template, paper size, scale, show/hide flags, …) plus the base layout and
// its per-scope overrides. Stored in the settings table under `print.layouts`
// as a JSON map:
//
//   { "<name>": { "settings": { "<field>": "<value>", … },
//                 "layout": "<base layout JSON>", "overrides": "<overrides JSON>" } }
// ---------------------------------------------------------------------------

export interface NamedPrintLayout {
  settings: Record<string, string>;
  layout: string;
  overrides: string;
}

export type NamedPrintLayouts = Record<string, NamedPrintLayout>;

export function encodeNamedLayouts(layouts: NamedPrintLayouts): string {
  return JSON.stringify(layouts);
}

export function decodeNamedLayouts(raw: string | undefined | null): NamedPrintLayouts {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: NamedPrintLayouts = {};
    for (const name of Object.keys(parsed)) {
      const entry = parsed[name];
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.layout !== 'string') continue;
      out[name] = {
        settings:
          e.settings && typeof e.settings === 'object'
            ? (e.settings as Record<string, string>)
            : {},
        layout: e.layout,
        overrides: typeof e.overrides === 'string' ? e.overrides : '{}',
      };
    }
    return out;
  } catch {
    return {};
  }
}
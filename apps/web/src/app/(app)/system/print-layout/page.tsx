'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { PrintableDocument } from '@/components/tx/printable-document';
import { useFlatOptions } from '@/hooks/use-options';
import {
  PRINT_DEFAULTS,
  type InvoiceTemplate,
  type PrintFontSize,
  type PrintHeaderAlign,
  type PrintLogoSize,
  type PrintSettings,
} from '@/hooks/use-print-settings';
import {
  LAYOUT_BLOCK_LABELS,
  PRINT_DOC_TYPES,
  blockFontSize,
  decodeLayoutOverrides,
  decodePrintLayout,
  defaultLayout,
  encodeLayoutOverrides,
  encodePrintLayout,
  estimateBlockHeight,
  estimateBlockWidth,
  paperPxFor,
  resolveLayout,
  type LayoutBlockAlign,
  type LayoutBlockConfig,
  type LayoutBlockKey,
  type PrintDocType,
  type PrintLayoutConfig,
  type PrintLayoutOverrides,
} from '@/lib/print-layout';
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

type Scope = { docType: 'default' | PrintDocType; warehouseId: string };
const DEFAULT_SCOPE: Scope = { docType: 'default', warehouseId: '*' };

/** Canvas display scale in the editor (50%). Pointer deltas are divided by this. */
const EDIT_SCALE = 0.5;

/** Snap increment for arrow nudging in the inspector. */
const NUDGE = 1;

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

const ALIGN_BUTTONS: { value: LayoutBlockAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

const cloneOverrides = (ov: PrintLayoutOverrides): PrintLayoutOverrides =>
  Object.fromEntries(Object.entries(ov).map(([k, v]) => [k, { ...v }]));

interface DragState {
  key: LayoutBlockKey;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
}

export default function PrintLayoutPage() {
  const qc = useQueryClient();
  const { options: warehouseOptions } = useFlatOptions('stock-locations');

  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
  });

  const [form, setForm] = useState<Settings>({});
  const [baseLayout, setBaseLayout] = useState<PrintLayoutConfig | null>(null);
  const [overrides, setOverrides] = useState<PrintLayoutOverrides>({});
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [layout, setLayout] = useState<PrintLayoutConfig | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<LayoutBlockKey | null>(null);
  const [error, setError] = useState('');
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (data && layout === null) {
      const base = decodePrintLayout(data['print.layout']) ?? defaultLayout();
      const ov = decodeLayoutOverrides(data['print.layoutOverrides']);
      setBaseLayout(base);
      setOverrides(ov);
      setLayout(layoutForScope(DEFAULT_SCOPE, base, ov));
      setSelectedBlock(null);
    }
  }, [data, layout]);

  const set = (field: string, v: string) => setForm((f) => ({ ...f, [field]: v }));

  const value = (field: string): string =>
    form[field] ?? (data ? data[FIELDS[field].key] : undefined) ?? FIELDS[field].def;

  const save = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/system/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const persistLayout = (base: PrintLayoutConfig, ov: PrintLayoutOverrides) => {
    setError('');
    const payload: Record<string, unknown> = {};
    for (const field of Object.keys(FIELDS)) payload[field] = value(field);
    payload.values = {
      'print.layout': encodePrintLayout(base),
      'print.layoutOverrides': encodeLayoutOverrides(ov),
    };
    save.mutate(payload);
  };

  const submit = () => {
    if (!layout) return;
    if (scope.docType === 'default') {
      setBaseLayout(layout);
      persistLayout(layout, overrides);
    } else {
      const next = cloneOverrides(overrides);
      next[scope.docType] = { ...(next[scope.docType] ?? {}), [scope.warehouseId]: layout };
      setOverrides(next);
      persistLayout(baseLayout ?? layout, next);
    }
  };

  const resetToDefaults = () => {
    setError('');
    const payload: Record<string, string> = {};
    for (const field of Object.keys(FIELDS)) payload[field] = FIELDS[field].def;
    setForm(payload);
    const fresh = defaultLayout();
    setBaseLayout(fresh);
    setOverrides({});
    setLayout(fresh);
    setSelectedBlock(null);
    save.mutate({
      ...payload,
      values: { 'print.layout': encodePrintLayout(fresh), 'print.layoutOverrides': '{}' },
    });
  };

  // ---- Custom layout helpers ---------------------------------------------
  const patchBlock = (key: LayoutBlockKey, patch: Partial<LayoutBlockConfig>) =>
    setLayout((l) =>
      l ? { ...l, blocks: l.blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)) } : l,
    );

  const moveBlock = (from: number, to: number) =>
    setLayout((l) => {
      if (!l) return l;
      const blocks = [...l.blocks];
      const [moved] = blocks.splice(from, 1);
      if (!moved) return l;
      blocks.splice(to, 0, moved);
      return { ...l, blocks };
    });

  const layoutForScope = (s: Scope, base: PrintLayoutConfig, ov: PrintLayoutOverrides) =>
    s.docType === 'default' ? base : resolveLayout(base, ov, s.docType, s.warehouseId === '*' ? null : s.warehouseId);

  const changeScope = (next: Scope) => {
    setScope(next);
    if (baseLayout) {
      setLayout(layoutForScope(next, baseLayout, overrides));
    }
    setSelectedBlock(null);
  };

  const hasExactOverride =
    scope.docType !== 'default' && !!overrides[scope.docType]?.[scope.warehouseId];

  const removeOverride = () => {
    if (scope.docType === 'default') return;
    const next = cloneOverrides(overrides);
    const byDoc = { ...(next[scope.docType] ?? {}) };
    delete byDoc[scope.warehouseId];
    if (Object.keys(byDoc).length === 0) delete next[scope.docType];
    else next[scope.docType] = byDoc;
    setOverrides(next);
    setSelectedBlock(null);
    if (baseLayout) {
      setLayout(layoutForScope({ ...scope }, baseLayout, next));
      persistLayout(baseLayout, next);
    }
  };

  // ---- Canvas drag --------------------------------------------------------
  const onBlockPointerDown = (e: React.PointerEvent<HTMLDivElement>, b: LayoutBlockConfig) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedBlock(b.key);
    dragRef.current = {
      key: b.key,
      startX: e.clientX,
      startY: e.clientY,
      origX: b.x,
      origY: b.y,
      moved: false,
    };
  };

  const onBlockPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / EDIT_SCALE;
    const dy = (e.clientY - d.startY) / EDIT_SCALE;
    if (!d.moved && (Math.abs(dx) < 1.5 || Math.abs(dy) < 1.5)) {
      // Only treat as a drag once the pointer really moves.
      if (Math.abs(e.clientX - d.startX) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
    }
    d.moved = true;
    patchBlock(d.key, {
      x: clamp(d.origX + Math.round(dx), -200, 1600),
      y: clamp(d.origY + Math.round(dy), -200, 2400),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const thermal = value('invoiceTemplate') === 'thermal';
  const isCustom = value('invoiceTemplate') === 'custom';

  const canvasW = paperPxFor(value('paperSize'), false);
  const canvasH = (layout?.blocks ?? []).reduce(
    (m, b) => Math.max(m, (b.y || 0) + estimateBlockHeight(b.key) + 16),
    240,
  );
  const editorBoxW = (b: LayoutBlockConfig) =>
    b.width > 0 ? b.width : b.key === 'itemsTable' ? canvasW : estimateBlockWidth(b.key);

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
    customLayout: layout,
    customLayoutOverrides: {},
  };

  const yN = (field: string, label: string) => (
    <Field label={label}>
      <Select value={value(field)} onChange={(e) => set(field, e.target.value)}>
        <option value="true">Show</option>
        <option value="false">Hide</option>
      </Select>
    </Field>
  );

  const selected = layout?.blocks.find((b) => b.key === selectedBlock) ?? null;
  const selectedIdx = layout?.blocks.findIndex((b) => b.key === selectedBlock) ?? -1;

  const numField = (
    label: string,
    current: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
    step = 1,
  ) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <div className="flex overflow-hidden rounded-md border border-slate-200">
          <button
            type="button"
            onClick={() => onChange(clamp(current - step, min, max))}
            className="px-1.5 py-0.5 text-slate-500 hover:bg-slate-100"
            title={`${label} −${step}`}
          >−</button>
          <button
            type="button"
            onClick={() => onChange(clamp(current + step, min, max))}
            className="border-l border-slate-200 px-1.5 py-0.5 text-slate-500 hover:bg-slate-100"
            title={`${label} +${step}`}
          >+</button>
        </div>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0, min, max))}
        className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-xs tabular-nums text-slate-700 outline-none focus:border-teal-400"
      />
    </div>
  );

  const scopeLabel =
    scope.docType === 'default'
      ? 'Default (all documents)'
      : `${PRINT_DOC_TYPES.find((t) => t.value === scope.docType)?.label ?? scope.docType}${
          scope.warehouseId === '*' ? ' — all warehouses' : ' — one warehouse'
        }`;

  return (
    <div>
      <PageHeader
        title="Print Layout"
        description="Design how invoices print. Pick a preset template, or use the Custom designer to click, drag, and pixel-position every element exactly where you want it."
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
                        <option value="custom">Custom (Designer)</option>
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
                    <Field label="Header Alignment" hint={isCustom ? 'Custom layout has per-block alignment' : undefined}>
                      <Select value={value('invoiceHeaderAlign')} onChange={(e) => set('invoiceHeaderAlign', e.target.value)} disabled={thermal || isCustom}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                      </Select>
                    </Field>
                  </div>
                </div>

                {isCustom && (
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Custom Designer</p>
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                        {layout?.blocks.filter((b) => b.enabled).length ?? 0} blocks shown
                      </span>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <Field label="Apply to">
                        <Select
                          value={scope.docType}
                          onChange={(e) =>
                            changeScope({ docType: e.target.value as Scope['docType'], warehouseId: '*' })
                          }
                        >
                          <option value="default">Default (all documents)</option>
                          {PRINT_DOC_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </Select>
                      </Field>
                      {scope.docType !== 'default' && (
                        <Field label="Warehouse">
                          <Select
                            value={scope.warehouseId}
                            onChange={(e) => changeScope({ ...scope, warehouseId: e.target.value })}
                          >
                            <option value="*">All warehouses</option>
                            {warehouseOptions.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </Select>
                        </Field>
                      )}
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-teal-800">Editing: {scopeLabel}</p>
                        <p className="text-[11px] text-teal-600">
                          {scope.docType === 'default'
                            ? 'This base layout applies wherever no override exists.'
                            : hasExactOverride
                              ? 'This override applies only to this scope.'
                              : 'No override yet — Saving creates one for this scope; otherwise the base/inherited layout is used.'}
                        </p>
                      </div>
                      {scope.docType !== 'default' && hasExactOverride && (
                        <button
                          type="button"
                          onClick={removeOverride}
                          className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Remove override
                        </button>
                      )}
                    </div>

                    <p className="mb-2 text-xs text-slate-400">
                      <b>Click</b> a block to select it. <b>Drag</b> it anywhere on the page. Fine-tune pixels in the
                      panel below.
                    </p>

                    {/* Page canvas */}
                    <div className="mt-1 overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4">
                      <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                        Page {canvasW} × {canvasH} px · {value('paperSize')} · coordinates from the top-left corner
                      </div>
                      <div style={{ width: canvasW * EDIT_SCALE + 2, height: canvasH * EDIT_SCALE + 2 }}>
                        <div
                          style={{
                            position: 'relative',
                            width: canvasW,
                            height: canvasH,
                            transform: `scale(${EDIT_SCALE})`,
                            transformOrigin: 'top left',
                            background: '#ffffff',
                            borderRadius: 4,
                            boxShadow: '0 1px 6px rgba(15, 23, 42, .18)',
                          }}
                        >
                          {(layout?.blocks ?? []).map((b, idx) => {
                            const isSel = selectedBlock === b.key;
                            return (
                              <div
                                key={b.key}
                                onPointerDown={(e) => onBlockPointerDown(e, b)}
                                onPointerMove={onBlockPointerMove}
                                onPointerUp={endDrag}
                                onPointerCancel={endDrag}
                                className={`pointer-events-auto flex items-center rounded-md border px-2 text-[11px] font-semibold ${
                                  isSel
                                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                                    : b.enabled
                                      ? 'border-dashed border-slate-300 bg-slate-50 text-slate-500'
                                      : 'border-dotted border-slate-200 bg-slate-100 text-slate-300'
                                }`}
                                style={{
                                  position: 'absolute',
                                  left: b.x,
                                  top: b.y,
                                  width: editorBoxW(b),
                                  height: estimateBlockHeight(b.key),
                                  cursor: 'move',
                                  userSelect: 'none',
                                  touchAction: 'none',
                                  zIndex: idx + 1,
                                  opacity: b.enabled ? 1 : 0.6,
                                  boxSizing: 'border-box',
                                }}
                              >
                                <span className="truncate">
                                  {LAYOUT_BLOCK_LABELS[b.key]}
                                  {isSel ? ` · ${b.x}, ${b.y}` : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Inspector */}
                    {selected ? (
                      <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-700">{LAYOUT_BLOCK_LABELS[selected.key]}</p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => selectedIdx > 0 && moveBlock(selectedIdx, selectedIdx - 1)}
                              className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100"
                              title="Send backward (behind other blocks that overlap)"
                            ><ChevronUp className="h-3.5 w-3.5" /></button>
                            <button
                              type="button"
                              onClick={() => selectedIdx >= 0 && selectedIdx < (layout?.blocks.length ?? 1) - 1 && moveBlock(selectedIdx, selectedIdx + 1)}
                              className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100"
                              title="Send forward (on top of other blocks that overlap)"
                            ><ChevronDown className="h-3.5 w-3.5" /></button>
                            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                              <input
                                type="checkbox"
                                checked={selected.enabled}
                                onChange={(e) => patchBlock(selected.key, { enabled: e.target.checked })}
                                className="rounded border-slate-300"
                              />
                              Show
                            </label>
                          </div>
                        </div>
                        <p className="-mt-2 text-xs text-slate-400">
                          X = distance in px from the page's left edge · Y = distance from the top edge.
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                          {numField('X', selected.x, -200, 1600, (v) => patchBlock(selected.key, { x: v }), NUDGE)}
                          {numField('Y', selected.y, -200, 2400, (v) => patchBlock(selected.key, { y: v }), NUDGE)}
                        </div>

                        {selected.key !== 'itemsTable' && (
                          numField('Width (0 = auto)', selected.width, 0, 1200, (v) => patchBlock(selected.key, { width: v }), 4)
                        )}

                        <div>
                          <div className="mb-1 text-xs font-medium text-slate-600">Text alignment</div>
                          <div className="grid grid-cols-3 gap-1">
                            {ALIGN_BUTTONS.map((a) => (
                              <button
                                key={a.value}
                                type="button"
                                onClick={() => patchBlock(selected.key, { align: a.value })}
                                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                  selected.align === a.value
                                    ? 'border-teal-400 bg-teal-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {selected.key !== 'logo' && (
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-600">Font Size</span>
                              <span className="tabular-nums text-slate-400">
                                {selected.fontSize === 0 ? 'Auto' : `${selected.fontSize}px`}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={36}
                              step={1}
                              value={selected.fontSize}
                              onChange={(e) => patchBlock(selected.key, { fontSize: Number(e.target.value) })}
                              className="w-full accent-teal-600"
                            />
                          </div>
                        )}

                        {selected.key !== 'itemsTable' && selected.key !== 'signatures' && (
                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={selected.bold}
                              onChange={(e) => patchBlock(selected.key, { bold: e.target.checked })}
                              className="rounded border-slate-300"
                            />
                            Bold text
                          </label>
                        )}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-400">
                        Click a block on the page above to fine-tune its exact position and style.
                      </p>
                    )}
                  </div>
                )}

                {!isCustom && (
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
                )}

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
                      docType={scope.docType === 'default' ? 'sale' : scope.docType}
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
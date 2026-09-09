'use client';

/**
 * Prints a DOM element (by id) in isolation, preserving its current layout.
 * Opens an invisible iframe, clones the node into it, then triggers the
 * browser print dialog scoped to that iframe. The rest of the app is never
 * printed because the iframe only contains the report.
 *
 * `overlay` (e.g. "CANCELLED", "DUPLICATE") is drawn as a translucent rotated
 * watermark across the page — used for cancelled documents and copy runs.
 *
 * Paper size (A4/A5/Letter) and print scale (50–100%) are read from
 * localStorage, which usePrintSettings() keeps in sync with the Settings page.
 */
export function printElement(id: string, title?: string, overlay?: string): void {
  const source = document.getElementById(id);
  if (!source) return;

  const { paper, scale, invoiceTemplate, showPageNumbers } = printPrefs();
  const thermal = invoiceTemplate === 'thermal';
  const isCustom = invoiceTemplate === 'custom';
  // An 80mm receipt prints as a continuous strip — the iframe just needs to be
  // tall enough to hold the whole document so the print dialog can paginate it.
  const frameSize = thermal ? { width: 302, height: 2000 } : PAPER_PX[paper] ?? PAPER_PX.A4;

  // Real dimensions (instead of 0×0) avoid blank prints in browsers that
  // refuse to render zero-sized iframe content.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'absolute';
  frame.style.left = '-10000px';
  frame.style.top = '0';
  frame.style.width = `${frameSize.width}px`;
  frame.style.height = `${frameSize.height}px`;
  frame.style.visibility = 'hidden';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  const headEl = document.querySelector('head');
  const headHTML = headEl
    ? Array.from(headEl.children)
        .filter((el) => el.tagName === 'STYLE' || el.tagName === 'LINK' || el.tagName === 'META')
        .map((el) => el.outerHTML)
        .join('')
    : '';
  const printable = source.cloneNode(true) as HTMLElement;
  // The source element may be parked off-screen (e.g. position:fixed; left:-200vw)
  // to keep it out of the app layout. Neutralize those inline styles on the
  // clone so it renders in-flow inside the print iframe.
  ['position', 'left', 'top', 'right', 'bottom', 'z-index', 'transform', 'opacity'].forEach((prop) =>
    printable.style.removeProperty(prop),
  );
  printable.style.width = '100%';
  printable.style.height = 'auto';

  let bodyHTML = printable.outerHTML;
  if (title && !isCustom) {
    bodyHTML = `<div style="text-align:center;font-size:16px;font-weight:700;margin:8px 24px 12px;">${escapeHtml(title)}</div>${bodyHTML}`;
  }
  if (overlay) {
    bodyHTML += `<div style="position:fixed;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-25deg);z-index:999;font-size:56px;font-weight:800;letter-spacing:10px;text-transform:uppercase;color:#dc2626;opacity:.16;border:5px solid #dc2626;border-radius:14px;padding:8px 28px;pointer-events:none;text-align:center;">${escapeHtml(overlay)}</div>`;
  }

  const pageFooterCss =
    showPageNumbers && !thermal
      ? '@bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:sans-serif;font-size:10px;color:#64748b;}'
      : '';
  const pageCss = `@media print{@page{size:${thermal ? '80mm auto' : paper};margin:${thermal ? '4mm 2mm' : '0 0 12mm 0'};${pageFooterCss}}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}`;

  doc.open();
  doc.write(`<!doctype html><html><head>${headHTML}<style>${pageCss}</style></head><body style="padding:0;margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;zoom:${scale / 100};">${bodyHTML}</body></html>`);
  doc.close();

  // Give the browser a tick to parse styles, then print.
  const print = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(() => frame.remove(), 1000);
    }
  };
  setTimeout(print, 400);
}

const PAPER_PX: Record<string, { width: number; height: number }> = {
  A4: { width: 794, height: 1123 }, // 210×297mm @96dpi
  A5: { width: 559, height: 794 }, //  148×210mm @96dpi
  Letter: { width: 816, height: 1056 }, // 8.5×11in @96dpi
};

function printPrefs(): { paper: 'A4' | 'A5' | 'Letter'; scale: number; invoiceTemplate: string; showPageNumbers: boolean } {
  let paper: 'A4' | 'A5' | 'Letter' = 'A4';
  try {
    const raw = localStorage.getItem('print.paperSize');
    if (raw === 'A5' || raw === 'Letter') paper = raw;
  } catch {
    // ignore
  }
  let scale = 100;
  try {
    const raw = Number(localStorage.getItem('print.scale'));
    if (Number.isFinite(raw)) scale = Math.min(100, Math.max(50, raw));
  } catch {
    // ignore
  }
  let invoiceTemplate = 'standard';
  try {
    const raw = localStorage.getItem('print.invoiceTemplate');
    if (raw === 'compact' || raw === 'thermal') invoiceTemplate = raw;
  } catch {
    // ignore
  }
  let showPageNumbers = true;
  try {
    showPageNumbers = localStorage.getItem('print.showPageNumbers') !== 'false';
  } catch {
    // ignore
  }
  return { paper, scale, invoiceTemplate, showPageNumbers };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Exports the first <table> inside an element (by id) to a CSV file that
 * opens cleanly in Excel / LibreOffice. Column headers are read from the
 * table's <th> cells; rows are read from <tbody>.
 */
export function downloadTableCSV(id: string, filename: string): void {
  const source = document.getElementById(id);
  if (!source) return;
  const table = source.querySelector('table');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('thead tr, tbody tr'));

  const lines = rows.map((tr) => {
    const cells = Array.from(tr.querySelectorAll('th, td'));
    return cells
      .map((cell) => {
        let text = String((cell as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
        text = text.replace(new RegExp(',', 'g'), ' ');
        text = text.replace(new RegExp('\r?\n', 'g'), ' ');
        return `"${text.replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.csv$/i.test(filename) ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exports the first <table> inside an element (by id) to a PDF file. The data
 * is laid out as a real table (headers + rows, zebra striping, page-break
 * aware) using jspdf + jspdf-autotable.
 */
export async function downloadTablePDF(id: string, filename: string, title?: string): Promise<void> {
  const source = document.getElementById(id);
  if (!source) return;
  const table = source.querySelector('table');
  if (!table) return;

  const head: string[] = [];
  const thead = table.querySelector('thead');
  if (thead) {
    thead.querySelectorAll('th').forEach((th) => head.push((th.textContent ?? '').replace(/\s+/g, ' ').trim()));
  }

  const body: string[][] = [];
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll('td, th').forEach((td) => cells.push((td.textContent ?? '').replace(/\s+/g, ' ').trim()));
    if (cells.length) body.push(cells);
  });

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

  const doc = new jsPDF({ orientation: head.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = 24;
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, pageWidth / 2, startY, { align: 'center' });
    startY += 16;
  }

  autoTable(doc, {
    ...(head.length ? { head: [head] } : {}),
    body,
    startY,
    margin: { left: 24, right: 24 },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    theme: 'striped',
  });

  doc.save(/\.pdf$/i.test(filename) ? filename : `${filename}.pdf`);
}
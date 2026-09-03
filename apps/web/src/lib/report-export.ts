'use client';

/**
 * Prints a DOM element (by id) in isolation, preserving its current layout.
 * Opens an invisible iframe, clones the node into it, then triggers the
 * browser print dialog scoped to that iframe. The rest of the app is never
 * printed because the iframe only contains the report.
 */
export function printElement(id: string, title?: string): void {
  const source = document.getElementById(id);
  if (!source) return;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
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
  printable.style.width = '100%';

  let bodyHTML = printable.outerHTML;
  if (title) {
    bodyHTML = `<div style="text-align:center;font-size:16px;font-weight:700;margin:8px 24px 12px;">${escapeHtml(title)}</div>${bodyHTML}`;
  }

  doc.open();
  doc.write(`<!doctype html><html><head>${headHTML}</head><body style="padding:16px;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">${bodyHTML}</body></html>`);
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
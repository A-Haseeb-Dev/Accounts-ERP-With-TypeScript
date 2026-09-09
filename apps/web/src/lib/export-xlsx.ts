'use client';

// Zero-dependency .xlsx (Excel Workbook) writer.
//
// An .xlsx file is a ZIP archive containing a few XML parts. We produce those
// parts and store the archive using the ZIP "store" method (no compression),
// which any spreadsheet app (Excel, LibreOffice, Google Sheets) opens natively.

const enc = new TextEncoder();

function escXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function colLetter(index: number): string {
  let s = '';
  let i = index + 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** Parses a cell's text into a number when it looks like one (e.g. "-1,250.00"). */
function toNumber(text: string): number | null {
  if (!text) return null;
  const clean = text.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

interface TableData {
  headers: string[];
  rows: (string | number)[][];
  widths: number[];
}

function readTable(table: HTMLTableElement): TableData {
  const headers: string[] = [];
  const thead = table.querySelector('thead');
  if (thead) {
    thead.querySelectorAll('th').forEach((th) => headers.push((th.textContent ?? '').replace(/\s+/g, ' ').trim()));
  }

  const rows: (string | number)[][] = [];
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const cells: (string | number)[] = [];
    tr.querySelectorAll('td, th').forEach((td) => {
      const text = (td.textContent ?? '').replace(/\s+/g, ' ').trim();
      cells.push(toNumber(text) ?? text);
    });
    if (cells.length) rows.push(cells);
  });

  const columns = Math.max(headers.length, ...rows.map((r) => r.length));
  const widths: number[] = [];
  const all = [headers, ...rows];
  for (let c = 0; c < columns; c += 1) {
    let max = 8;
    for (const row of all) {
      if (c < row.length) max = Math.max(max, String(row[c]).length);
    }
    widths.push(Math.min(max + 2, 45));
  }
  return { headers, rows, widths };
}

function sheetXml({ headers, rows, widths }: TableData): string {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body: string[] = [];

  const cell = (value: string | number, col: number, row: number, style: number | null): string => {
    const ref = `${colLetter(col)}${row}`;
    const sAttr = style != null ? ` s="${style}"` : '';
    if (typeof value === 'number') return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;
  };

  body.push(`<row r="1">${headers.map((h, i) => cell(h, i, 1, 1)).join('')}</row>`);
  rows.forEach((row, r) => {
    body.push(`<row r="${r + 2}">${row.map((v, c) => cell(v, c, r + 2, null)).join('')}</row>`);
  });

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${body.join('')}</sheetData>` +
    `</worksheet>`
  );
}

const ZIP_CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ZIP_ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>` +
  `</workbook>`;

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `</styleSheet>`;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(num: number): number[] {
  return [num & 0xff, (num >> 8) & 0xff];
}

function u32(num: number): number[] {
  return [num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, (num >>> 24) & 0xff];
}

interface ZipFile {
  name: string;
  data: Uint8Array;
}

/** Assembles a ZIP archive (store method, no compression) from XML parts. */
function toZip(files: ZipFile[]): Blob {
  const bytes: number[] = [];
  const central: number[] = [];
  let offset = 0;
  const time = 0x0000;
  const date = 0x20e1;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    bytes.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
    );
    bytes.push(...Array.from(nameBytes), ...Array.from(file.data));

    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
    );
    central.push(...Array.from(nameBytes));

    offset += 30 + nameBytes.length + size;
  }

  const cdSize = central.length;
  bytes.push(...central);
  bytes.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(cdSize),
    ...u32(offset),
    ...u16(0),
  );

  return new Blob([Uint8Array.from(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadTableXLSX(id: string, filename: string): void {
  const source = document.getElementById(id);
  if (!source) return;
  const table = source.querySelector('table');
  if (!table) return;

  const data = readTable(table);
  const sheet = sheetXml(data);

  const blob = toZip([
    { name: '[Content_Types].xml', data: enc.encode(ZIP_CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ZIP_ROOT_RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(WORKBOOK) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
  ]);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.xlsx$/i.test(filename) ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
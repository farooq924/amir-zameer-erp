import { DEVELOPER } from '@/components/PrintFooter';
import type { DataColumn } from './types';

/** Developer credit carried by every table print and export (same text as <PrintFooter />). */
export const FOOTER_TEXT = `Software developed by ${DEVELOPER.name} | ${DEVELOPER.website} | ${DEVELOPER.phone}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function todayText() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fileSafe(name: string) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'table'}-${stamp}`;
}

/** Columns that go to print / export (they need a text or value accessor). */
export function outputColumns<T>(columns: DataColumn<T>[]) {
  return columns.filter((c) => c.exportable !== false && (c.text || c.value));
}

export function colLabel<T>(c: DataColumn<T>) {
  return c.label ?? (typeof c.header === 'string' ? c.header : c.id);
}

export function cellRaw<T>(c: DataColumn<T>, row: T): string | number | null {
  const v = c.value ? c.value(row) : c.text ? c.text(row) : null;
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v instanceof Date) return v.toISOString();
  return v;
}

export function cellString<T>(c: DataColumn<T>, row: T): string {
  if (c.text) return c.text(row) ?? '';
  const v = cellRaw(c, row);
  if (v === null) return '';
  if (c.type === 'money' && v !== '' && !Number.isNaN(Number(v))) return Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return String(v);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const csvEscape = (raw: string) => {
  // Text starting with = + - @ could run as a formula in Excel: prefix it with an apostrophe.
  const s = /^[=+\-@]/.test(raw) && Number.isNaN(Number(raw)) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv<T>(title: string, columns: DataColumn<T>[], rows: T[]) {
  const cols = outputColumns(columns);
  const lines = [
    cols.map((c) => csvEscape(colLabel(c))).join(','),
    ...rows.map((r) => cols.map((c) => {
      const isNum = c.type === 'money' || c.type === 'number';
      const raw = isNum ? cellRaw(c, r) : cellString(c, r);
      return csvEscape(raw === null ? '' : String(raw));
    }).join(',')),
    '',
    csvEscape(FOOTER_TEXT),
  ];
  download(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), `${fileSafe(title)}.csv`);
}

async function loadExcel() {
  const mod = await import('exceljs');
  return (mod.default ?? mod) as typeof import('exceljs');
}

export async function exportExcel<T>(title: string, business: string, columns: DataColumn<T>[], rows: T[]) {
  const ExcelJS = await loadExcel();
  const cols = outputColumns(columns);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TailoringERP';
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Sheet1');
  const last = Math.max(cols.length, 1);
  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = business ? `${business} - ${title}` : title;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF101F3D' } };
  ws.mergeCells(2, 1, 2, last);
  ws.getCell(2, 1).value = `Printed ${todayText()} · ${rows.length} record${rows.length === 1 ? '' : 's'}`;
  ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF5B6577' } };
  const header = ws.getRow(4);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = colLabel(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101F3D' } };
    cell.alignment = { vertical: 'middle', horizontal: c.align === 'right' ? 'right' : 'left' };
  });
  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const raw = cellRaw(c, r);
      if ((c.type === 'money' || c.type === 'number') && raw !== null && raw !== '' && !Number.isNaN(Number(raw))) {
        cell.value = Number(raw);
        cell.numFmt = c.type === 'money' ? '#,##0.00' : '#,##0.##';
      } else {
        cell.value = cellString(c, r);
      }
      if (c.align === 'right') cell.alignment = { horizontal: 'right' };
    });
  });
  cols.forEach((c, i) => {
    const longest = Math.max(colLabel(c).length, ...rows.slice(0, 500).map((r) => cellString(c, r).length));
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 8), 50);
  });
  const footRow = 5 + rows.length + 1;
  ws.mergeCells(footRow, 1, footRow, last);
  ws.getCell(footRow, 1).value = FOOTER_TEXT;
  ws.getCell(footRow, 1).font = { size: 9, italic: true, color: { argb: 'FF5B6577' } };
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileSafe(title)}.xlsx`);
}

/** Blank Excel file with the import columns, so users know the expected layout. */
export async function downloadTemplate(title: string, fields: { label: string; example?: string; required?: boolean }[]) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import');
  fields.forEach((f, i) => {
    const cell = ws.getRow(1).getCell(i + 1);
    cell.value = f.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f.required ? 'FFBE9637' : 'FF101F3D' } };
    ws.getRow(2).getCell(i + 1).value = f.example ?? '';
    ws.getColumn(i + 1).width = Math.max(f.label.length + 4, 16);
  });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileSafe(`${title}-import-template`)}.xlsx`);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function excelCellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return excelCellText(o.result);
    return '';
  }
  return String(v);
}

/** Reads the first sheet of an .xlsx or a .csv file into rows of text (first non-empty row = headers). */
export async function readSheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return parseCsv((await file.text()).replace(/^﻿/, ''));
  }
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let i = 1; i <= ws.columnCount; i++) cells.push(excelCellText(row.getCell(i).value).trim());
    out.push(cells);
  });
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Prints rows as an A4 table (navy header, Brandistan footer) from a hidden frame. */
export function printTable<T>(title: string, business: string, columns: DataColumn<T>[], rows: T[]) {
  const cols = outputColumns(columns);
  const landscape = cols.length > 6;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Inter, 'Segoe UI', Arial, sans-serif; color: #101f3d; margin: 0; font-size: 11px; }
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #be9637; padding-bottom: 6px; margin-bottom: 10px; }
h1 { margin: 0; font-size: 18px; } h2 { margin: 2px 0 0; font-size: 13px; color: #be9637; font-weight: 600; }
.meta { text-align: right; font-size: 10px; color: #5b6577; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th { background: #101f3d; color: #fff; text-align: left; padding: 6px 7px; font-size: 10px; font-weight: 600; }
td { padding: 5px 7px; border-bottom: 1px solid #e3e6ec; vertical-align: top; }
tr:nth-child(even) td { background: #f7f8fb; }
.r { text-align: right; white-space: nowrap; }
tr { break-inside: avoid; }
.foot { margin-top: 14px; border-top: 1px solid #ccd; padding-top: 5px; text-align: center; font-size: 9px; color: #5b6577; }
</style></head><body>
<div class="head"><div><h1>${esc(business || 'TailoringERP')}</h1><h2>${esc(title)}</h2></div>
<div class="meta">Printed ${esc(todayText())}<br>${rows.length} record${rows.length === 1 ? '' : 's'}</div></div>
<table><thead><tr>${cols.map((c) => `<th class="${c.align === 'right' ? 'r' : ''}">${esc(colLabel(c))}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${esc(cellString(c, r))}</td>`).join('')}</tr>`).join('')}</tbody></table>
<div class="foot">${esc(FOOTER_TEXT)}</div>
</body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  setTimeout(go, 150);
}

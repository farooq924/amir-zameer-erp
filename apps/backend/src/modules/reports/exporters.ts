import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportColumn, ReportResult, ReportRow } from '@az/shared';

/** Developer credit printed on every export / print (same text as the app's PrintFooter). */
export const DEVELOPER_FOOTER = 'Software developed by Brandistan | www.brandistan.pk | 0333-2532924';

export interface Business {
  name: string;
  line: string;
  phone: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NAVY = '#101F3D';
const GOLD = '#BE9637';

export function dateText(v: string) {
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}
export function dateTimeText(v: string) {
  const local = new Date(new Date(v).getTime() + 5 * 3_600_000).toISOString();
  return `${dateText(local)} ${local.slice(11, 16)}`;
}
const grouped = (n: number, dp: number) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Display text for a cell (PDF, CSV). */
export function cellText(c: ReportColumn, v: ReportRow[string], forCsv = false): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  switch (c.type) {
    case 'money': return forCsv ? Number(s).toFixed(2) : grouped(Number(s), 2);
    case 'qty': return forCsv ? s : grouped(Number(s), s.includes('.') ? s.split('.')[1].length : 0);
    case 'number': return forCsv ? s : grouped(Number(s), 0);
    case 'percent': return `${s}%`;
    case 'date': return forCsv ? s.slice(0, 10) : dateText(s);
    case 'datetime': return dateTimeText(s);
    case 'month': { const [y, m] = s.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; }
    default: return s;
  }
}

const isNumeric = (c: ReportColumn) => ['money', 'qty', 'number', 'percent'].includes(c.type);

export function pickColumns(r: ReportResult, keys?: string) {
  const want = keys ? keys.split(',').map((k) => k.trim()).filter(Boolean) : null;
  const cols = want ? r.columns.filter((c) => want.includes(c.key)) : r.columns.filter((c) => !c.optional);
  return cols.length ? cols : r.columns.filter((c) => !c.optional);
}

// ------------------------------------------------------------------ CSV

export function toCsv(r: ReportResult, cols: ReportColumn[]): Buffer {
  const esc = (raw: string) => {
    // Text starting with = + - @ could run as a formula in Excel: prefix it with an apostrophe.
    const s = /^[=+\-@]/.test(raw) && Number.isNaN(Number(raw)) ? `'${raw}` : raw;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    [r.title, r.period].map(esc).join(','),
    cols.map((c) => esc(c.label)).join(','),
    ...r.rows.map((row) => cols.map((c) => esc(cellText(c, row[c.key], true))).join(',')),
  ];
  if (r.totals) lines.push(cols.map((c, i) => (r.totals![c.key] !== undefined ? cellText(c, r.totals![c.key], true) : i === 0 ? 'Total' : '')).map(esc).join(','));
  lines.push('', esc(DEVELOPER_FOOTER));
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

// ------------------------------------------------------------------ Excel

export async function toXlsx(r: ReportResult, cols: ReportColumn[], biz: Business): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = biz.name;
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 5 }], pageSetup: { orientation: cols.length > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const last = Math.max(cols.length, 2);
  const title = (row: number, text: string, size: number, bold = true, color = 'FF101F3D') => {
    ws.mergeCells(row, 1, row, last);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { bold, size, color: { argb: color } };
  };
  title(1, biz.name, 16);
  title(2, r.title, 13, true, 'FF9A7420');
  title(3, `${r.period}${r.note ? ` · ${r.note}` : ''}`, 10, false, 'FF555555');
  title(4, `Generated ${dateTimeText(r.generatedAt)}`, 9, false, 'FF777777');
  const head = ws.getRow(5);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101F3D' } };
    cell.alignment = { horizontal: isNumeric(c) ? 'right' : 'left', vertical: 'middle' };
  });
  head.height = 20;
  const valueOf = (c: ReportColumn, v: ReportRow[string]) => {
    if (v === null || v === undefined || v === '') return null;
    if (c.type === 'money' || c.type === 'qty' || c.type === 'number') return Number(v);
    if (c.type === 'percent') return Number(v) / 100;
    if (c.type === 'date') return new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
    if (c.type === 'datetime' || c.type === 'month') return cellText(c, v);
    return String(v);
  };
  const style = (cell: ExcelJS.Cell, c: ReportColumn) => {
    if (c.type === 'money') cell.numFmt = '#,##0.00;[Red]-#,##0.00';
    else if (c.type === 'qty') cell.numFmt = '#,##0.000';
    else if (c.type === 'number') cell.numFmt = '#,##0';
    else if (c.type === 'percent') cell.numFmt = '0.0%';
    else if (c.type === 'date') cell.numFmt = 'dd-mmm-yyyy';
  };
  for (const row of r.rows) {
    const xr = ws.addRow(cols.map((c) => valueOf(c, row[c.key])));
    cols.forEach((c, i) => style(xr.getCell(i + 1), c));
    if (row._kind === 'section' || row._kind === 'subtotal' || row._kind === 'total') {
      xr.font = { bold: true, color: { argb: row._kind === 'total' ? 'FF101F3D' : 'FF000000' } };
      if (row._kind !== 'subtotal') xr.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row._kind === 'total' ? 'FFF6EFDD' : 'FFF1F3F7' } }; });
    }
  }
  if (r.totals) {
    const tr = ws.addRow(cols.map((c, i) => (r.totals![c.key] !== undefined ? Number(r.totals![c.key]) : i === 0 ? 'Total' : null)));
    cols.forEach((c, i) => style(tr.getCell(i + 1), c));
    tr.font = { bold: true };
    tr.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6EFDD' } }; cell.border = { top: { style: 'thin', color: { argb: 'FFBE9637' } } }; });
  }
  ws.addRow([]);
  const f = ws.addRow([DEVELOPER_FOOTER]);
  ws.mergeCells(f.number, 1, f.number, last);
  f.getCell(1).font = { size: 9, italic: true, color: { argb: 'FF777777' } };
  // Column widths from content.
  cols.forEach((c, i) => {
    const lens = [c.label.length, ...r.rows.slice(0, 500).map((row) => cellText(c, row[c.key]).length)];
    ws.getColumn(i + 1).width = Math.min(50, Math.max(10, Math.max(...lens) + 2));
  });
  ws.headerFooter.oddFooter = `&L&8${DEVELOPER_FOOTER}&R&8Page &P of &N`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ------------------------------------------------------------------ PDF

export function toPdf(r: ReportResult, cols: ReportColumn[], biz: Business): Promise<Buffer> {
  const landscape = cols.length > 6;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margins: { top: 36, bottom: 40, left: 32, right: 32 }, bufferPages: true, info: { Title: `${r.title} - ${biz.name}`, Author: biz.name, Creator: 'TailoringERP By Brandistan' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 14;
  const fontSize = cols.length > 11 ? 6.5 : cols.length > 8 ? 7.5 : 8.5;

  // Column widths: share of the page by typical content length.
  const weight = cols.map((c) => {
    const sample = r.rows.slice(0, 200).map((row) => cellText(c, row[c.key]).length);
    const typical = Math.max(c.label.length + 1, ...sample.map((n) => Math.min(n, 40)));
    return Math.max(4, typical);
  });
  const sumW = weight.reduce((a, b) => a + b, 0);
  const widths = weight.map((w) => (w / sumW) * width);

  // Header block.
  doc.font('Helvetica-Bold').fontSize(15).fillColor(NAVY).text(biz.name, left, doc.y);
  if (biz.line || biz.phone) doc.font('Helvetica').fontSize(8.5).fillColor('#444444').text([biz.line, biz.phone].filter(Boolean).join(' | '));
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(GOLD).text(r.title);
  doc.font('Helvetica').fontSize(8.5).fillColor('#444444').text(`${r.period} · Generated ${dateTimeText(r.generatedAt)}`);
  if (r.summary.length) {
    doc.moveDown(0.2);
    doc.fontSize(8.5).fillColor('#222222').text(r.summary.map((s) => `${s.label}: ${s.type === 'money' ? `Rs ${grouped(Number(s.value), 2)}` : s.value}`).join('    '));
  }
  if (r.note) doc.fontSize(7.5).fillColor('#666666').text(r.note);
  doc.moveDown(0.5);

  const rowHeight = (cells: string[], bold: boolean) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    return Math.max(...cells.map((t, i) => doc.heightOfString(t || ' ', { width: widths[i] - 6 }))) + 6;
  };
  const drawRow = (cells: string[], opts: { bold?: boolean; fill?: string; color?: string; line?: string } = {}) => {
    const h = rowHeight(cells, !!opts.bold);
    if (doc.y + h > bottom()) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    if (opts.fill) doc.rect(left, y, width, h).fill(opts.fill);
    let x = left;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(opts.color ?? '#111111');
    cells.forEach((t, i) => {
      doc.text(t, x + 3, y + 3, { width: widths[i] - 6, align: isNumeric(cols[i]) ? 'right' : 'left' });
      x += widths[i];
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.4).strokeColor(opts.line ?? '#DDDDDD').stroke();
    doc.y = y + h;
    doc.x = left;
  };
  const header = () => drawRow(cols.map((c) => c.label), { bold: true, fill: NAVY, color: '#FFFFFF', line: NAVY });

  header();
  if (!r.rows.length) drawRow(cols.map((_, i) => (i === 0 ? 'No records for this period / filter' : '')));
  r.rows.forEach((row, n) => {
    const cells = cols.map((c) => cellText(c, row[c.key]));
    if (row._kind === 'section') drawRow(cells, { bold: true, fill: '#F1F3F7' });
    else if (row._kind === 'total') drawRow(cells, { bold: true, fill: '#F6EFDD', line: GOLD });
    else if (row._kind === 'subtotal') drawRow(cells, { bold: true });
    else drawRow(cells, { fill: n % 2 ? '#FAFAFA' : undefined, color: row._exclude ? '#888888' : undefined });
  });
  if (r.totals) drawRow(cols.map((c, i) => (r.totals![c.key] !== undefined ? cellText(c, r.totals![c.key]) : i === 0 ? 'Total' : '')), { bold: true, fill: '#F6EFDD', line: GOLD });

  // Footer on every page: developer credit + page number.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - doc.page.margins.bottom + 8;
    doc.page.margins.bottom = 0;
    doc.moveTo(left, y - 4).lineTo(left + width, y - 4).lineWidth(0.4).strokeColor('#BBBBBB').stroke();
    doc.font('Helvetica').fontSize(7).fillColor('#666666');
    doc.text(DEVELOPER_FOOTER, left, y, { width: width * 0.75, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, left + width * 0.75, y, { width: width * 0.25, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

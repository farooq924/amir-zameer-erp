import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/services/api';
import { downloadTemplate, readSheet } from './files';
import type { TableImporter } from './types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface Parsed { rows: Record<string, string>[]; missing: string[]; matched: string[] }

function mapRows(importer: TableImporter, sheet: string[][]): Parsed {
  const nonEmpty = sheet.filter((r) => r.some((c) => c.trim() !== ''));
  const [header = [], ...body] = nonEmpty;
  const index: Record<string, number> = {};
  importer.fields.forEach((f) => {
    const names = [f.label, f.key, ...(f.aliases ?? [])].map(norm);
    const at = header.findIndex((h) => names.includes(norm(h)));
    if (at >= 0) index[f.key] = at;
  });
  const rows = body.map((r) => {
    const o: Record<string, string> = {};
    importer.fields.forEach((f) => { if (index[f.key] !== undefined) o[f.key] = (r[index[f.key]] ?? '').trim(); });
    return o;
  });
  return {
    rows,
    matched: importer.fields.filter((f) => index[f.key] !== undefined).map((f) => f.label),
    missing: importer.fields.filter((f) => f.required && index[f.key] === undefined).map((f) => f.label),
  };
}

export function ImportDialog({ open, onOpenChange, title, importer, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  importer: TableImporter;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: number; failed: { row: number; message: string }[] } | null>(null);

  const reset = () => { setFileName(''); setParsed(null); setProgress(0); setResult(null); if (fileRef.current) fileRef.current.value = ''; };
  const close = (o: boolean) => { if (busy) return; if (!o) reset(); onOpenChange(o); };

  const pick = async (file?: File) => {
    if (!file) return;
    setResult(null);
    try {
      const sheet = await readSheet(file);
      setFileName(file.name);
      setParsed(mapRows(importer, sheet));
    } catch (e) {
      toast.error(`Could not read the file: ${errorMessage(e)}`);
    }
  };

  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    const failed: { row: number; message: string }[] = [];
    let ok = 0;
    for (let i = 0; i < parsed.rows.length; i++) {
      const data = parsed.rows[i];
      const missing = importer.fields.filter((f) => f.required && !data[f.key]).map((f) => f.label);
      if (missing.length) failed.push({ row: i + 2, message: `Missing ${missing.join(', ')}` });
      else {
        try { await importer.createRow(data); ok++; } catch (e) { failed.push({ row: i + 2, message: errorMessage(e) }); }
      }
      setProgress(i + 1);
    }
    setBusy(false);
    setResult({ ok, failed });
    if (ok) { toast.success(`${ok} record${ok === 1 ? '' : 's'} imported`); onDone(); }
    if (failed.length) toast.warning(`${failed.length} row${failed.length === 1 ? '' : 's'} could not be imported`);
  };

  const preview = parsed?.rows.slice(0, 5) ?? [];
  const shownFields = importer.fields.filter((f) => parsed?.matched.includes(f.label));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><Upload className="h-5 w-5 text-primary" /> Import {title}</DialogTitle>
          <DialogDescription>Upload an Excel (.xlsx) or CSV file. The first row must have the column names.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-primary/50 bg-gold-soft/40 p-4 text-sm">
            <p className="font-medium">Columns</p>
            <p className="mt-1 text-muted-foreground">
              {importer.fields.map((f, i) => (
                <span key={f.key}>{i > 0 && ', '}<span className={f.required ? 'font-semibold text-foreground' : ''}>{f.label}{f.required && ' *'}</span></span>
              ))}
            </p>
            {importer.note && <p className="mt-1 text-xs text-muted-foreground">{importer.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => downloadTemplate(title, importer.fields)}><Download /> Download template</Button>
              <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}><FileSpreadsheet /> Choose file</Button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            </div>
          </div>

          {parsed && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">{fileName}</span> · {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} found</p>
              {parsed.missing.length > 0 && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  Required column missing: {parsed.missing.join(', ')}. Download the template to see the expected columns.
                </p>
              )}
              {preview.length > 0 && shownFields.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-navy text-white"><tr>{shownFields.map((f) => <th key={f.key} className="px-2 py-1.5 text-left font-semibold">{f.label}</th>)}</tr></thead>
                    <tbody>{preview.map((r, i) => <tr key={i} className="border-b last:border-0">{shownFields.map((f) => <td key={f.key} className="px-2 py-1.5">{r[f.key]}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
              {parsed.rows.length > 5 && <p className="text-xs text-muted-foreground">Showing the first 5 rows.</p>}
            </div>
          )}

          {busy && parsed && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(progress / Math.max(parsed.rows.length, 1)) * 100}%` }} /></div>
              <p className="mt-1 text-xs text-muted-foreground">Importing {progress} of {parsed.rows.length}...</p>
            </div>
          )}

          {result && (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> {result.ok} imported</p>
              {result.failed.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-rose-200 p-2 dark:border-rose-500/30">
                  {result.failed.map((f) => (
                    <p key={f.row} className="flex items-start gap-2 py-0.5 text-rose-700 dark:text-rose-300"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Row {f.row}: {f.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button onClick={run} loading={busy} disabled={!parsed || parsed.rows.length === 0 || parsed.missing.length > 0}>
              <Upload /> Import {parsed?.rows.length ?? 0} row{parsed?.rows.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

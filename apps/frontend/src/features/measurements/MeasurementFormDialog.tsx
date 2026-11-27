import { CM_PER_INCH } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Ruler, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { api, errorMessage } from '@/services/api';
import { newId } from '@/utils/id';
import type { Measurement, MeasurementTemplate } from '@/types';

type Unit = 'INCH' | 'CM';
const DECIMAL = /^\d{1,3}(\.\d{1,2})?$/;
const MAX: Record<Unit, number> = { INCH: 150, CM: 381 };

interface CustomRow { key: number; label: string; value: string; textValue: string }

function convert(v: string, from: Unit, to: Unit): string {
  if (!v || from === to || !DECIMAL.test(v)) return v;
  const n = from === 'INCH' ? Number(v) * CM_PER_INCH : Number(v) / CM_PER_INCH;
  return String(Math.round(n * 100) / 100);
}

export function MeasurementFormDialog({ open, onOpenChange, customerId, templates, templateId, latest = {}, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customerId: string;
  templates: MeasurementTemplate[];
  templateId?: string;
  /** Latest saved version per template id, used to prefill the form. */
  latest?: Record<string, Measurement>;
  onSaved?: (m: Measurement) => void;
}) {
  const qc = useQueryClient();
  const [tplId, setTplId] = useState('');
  const [unit, setUnit] = useState<Unit>('INCH');
  const [values, setValues] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<CustomRow[]>([]);
  const [takenByName, setTakenByName] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requestId = useRef<string>('');
  const nextKey = useRef(1);

  const template = templates.find((t) => t.id === tplId);
  const fields = useMemo(() => (template?.fields ?? []).filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [template]);

  const prefill = (id: string) => {
    const prev = latest[id];
    const t = templates.find((x) => x.id === id);
    setUnit(prev?.unit ?? t?.defaultUnit ?? 'INCH');
    const v: Record<string, string> = {};
    const c: CustomRow[] = [];
    for (const val of prev?.values ?? []) {
      if (val.isCustom) c.push({ key: nextKey.current++, label: val.fieldLabel, value: val.value ? String(Number(val.value)) : '', textValue: val.textValue ?? '' });
      else if (val.value != null) v[val.fieldKey] = String(Number(val.value));
    }
    setValues(v);
    setCustom(c);
    setErrors({});
  };

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    requestId.current = newId();
    const id = templateId ?? templates.find((t) => t.isActive)?.id ?? '';
    setTplId(id);
    prefill(id);
    setTakenByName('');
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId]);

  const changeUnit = (u: Unit) => {
    setValues((prev) => Object.fromEntries(Object.entries(prev).map(([k, val]) => [k, convert(val, unit, u)])));
    setCustom((prev) => prev.map((r) => ({ ...r, value: convert(r.value, unit, u) })));
    setUnit(u);
  };

  const changeTemplate = (id: string) => {
    setTplId(id);
    prefill(id);
  };
  const previous = latest[tplId];

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const check = (raw: string, key: string) => {
      if (!raw) return;
      if (!DECIMAL.test(raw)) e[key] = 'Use a number like 40 or 40.5';
      else if (Number(raw) <= 0 || Number(raw) > MAX[unit]) e[key] = `Must be between 0 and ${MAX[unit]} ${unit === 'INCH' ? 'in' : 'cm'}`;
    };
    for (const f of fields) {
      const raw = (values[f.key] ?? '').trim();
      if (f.isRequired && !raw) e[f.key] = 'Required';
      check(raw, f.key);
    }
    const labels = new Set<string>();
    custom.forEach((r) => {
      const k = `custom-${r.key}`;
      if (!r.label.trim() && (r.value || r.textValue)) e[k] = 'Enter a name for this measurement';
      if (r.label.trim()) {
        const lower = r.label.trim().toLowerCase();
        if (labels.has(lower) || fields.some((f) => f.label.toLowerCase() === lower)) e[k] = 'This name is already used';
        labels.add(lower);
        if (!r.value.trim() && !r.textValue.trim()) e[k] = 'Enter a value or a note';
      }
      check(r.value.trim(), k);
    });
    if (fields.every((f) => !(values[f.key] ?? '').trim()) && !custom.some((r) => r.label.trim())) e.form = 'Enter at least one measurement';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = useMutation({
    mutationFn: () => api.post<Measurement>(`/customers/${customerId}/measurements`, {
      id: requestId.current,
      templateId: tplId,
      unit,
      values: fields.map((f) => ({ fieldKey: f.key, value: (values[f.key] ?? '').trim() || undefined })).filter((v) => v.value),
      customValues: custom.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), value: r.value.trim() || undefined, textValue: r.textValue.trim() || undefined })),
      takenByName: takenByName.trim() || undefined,
      notes: notes.trim() || undefined,
    }),
    onSuccess: (m) => {
      toast.success(`Measurement saved as version ${m.versionNo}`);
      void qc.invalidateQueries({ queryKey: ['measurements'] });
      void qc.invalidateQueries({ queryKey: ['customer', customerId] });
      onSaved?.(m);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const unitLabel = unit === 'INCH' ? 'in' : 'cm';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle><Ruler className="h-5 w-5 text-primary" />{previous ? 'New measurement version' : 'Take measurement'}</DialogTitle>
          <DialogDescription>
            {previous
              ? `Prefilled from version ${previous.versionNo}. Saving creates version ${previous.versionNo + 1}; earlier versions are kept unchanged.`
              : 'Enter the measurements. Leave a field empty if it was not measured.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (validate()) save.mutate(); }} noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="m-template">Garment</Label>
              <NativeSelect id="m-template" value={tplId} onChange={(e) => changeTemplate(e.target.value)} disabled={!!templateId}>
                {templates.filter((t) => t.isActive || t.id === tplId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-unit">Unit</Label>
              <NativeSelect id="m-unit" value={unit} onChange={(e) => changeUnit(e.target.value as Unit)}>
                <option value="INCH">Inches</option><option value="CM">Centimetres</option>
              </NativeSelect>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            {fields.map((f) => (
              <div key={f.id} className="space-y-1">
                <Label htmlFor={`m-${f.key}`} required={f.isRequired}>{f.label}</Label>
                <div className="relative">
                  <Input
                    id={`m-${f.key}`} inputMode="decimal" autoComplete="off" className="pr-9"
                    value={values[f.key] ?? ''} aria-invalid={!!errors[f.key]}
                    onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value.replace(',', '.') }))}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-2 text-xs text-muted-foreground">{unitLabel}</span>
                </div>
                <FieldError message={errors[f.key]} />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Extra measurements</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustom((p) => [...p, { key: nextKey.current++, label: '', value: '', textValue: '' }])}>
                <Plus /> Add field
              </Button>
            </div>
            {custom.length === 0 && <p className="text-xs text-muted-foreground">Add anything this template does not cover, e.g. Pocket Height or Button Style.</p>}
            {custom.map((r) => (
              <div key={r.key}>
                <div className="grid grid-cols-[1fr_6rem_1fr_auto] items-center gap-2">
                  <Input aria-label="Field name" placeholder="Name" value={r.label} onChange={(e) => setCustom((p) => p.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))} />
                  <Input aria-label="Value" placeholder={unitLabel} inputMode="decimal" value={r.value} onChange={(e) => setCustom((p) => p.map((x) => (x.key === r.key ? { ...x, value: e.target.value.replace(',', '.') } : x)))} />
                  <Input aria-label="Note" placeholder="Note (optional)" value={r.textValue} onChange={(e) => setCustom((p) => p.map((x) => (x.key === r.key ? { ...x, textValue: e.target.value } : x)))} />
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove field" onClick={() => setCustom((p) => p.filter((x) => x.key !== r.key))}><Trash2 /></Button>
                </div>
                <FieldError message={errors[`custom-${r.key}`]} />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-taken">Measured by</Label>
              <Input id="m-taken" placeholder="Master's name" value={takenByName} onChange={(e) => setTakenByName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-notes">Notes</Label>
              <Textarea id="m-notes" rows={2} placeholder="Fitting preference, posture, etc." value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </div>
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!tplId}>Save measurement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

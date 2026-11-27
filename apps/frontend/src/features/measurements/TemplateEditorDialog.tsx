import { GARMENT_CATEGORIES } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, LayoutList, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { api, errorMessage } from '@/services/api';
import type { MeasurementTemplate } from '@/types';

interface Row { rowKey: number; id?: string; label: string; isRequired: boolean; isActive: boolean }

export function TemplateEditorDialog({ open, onOpenChange, template }: {
  open: boolean; onOpenChange: (o: boolean) => void; template?: MeasurementTemplate | null;
}) {
  const qc = useQueryClient();
  const editing = !!template;
  const nextKey = useRef(1);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('CUSTOM');
  const [unit, setUnit] = useState<'INCH' | 'CM'>('INCH');
  const [active, setActive] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setCategory(template?.garmentCategory ?? 'CUSTOM');
    setUnit(template?.defaultUnit ?? 'INCH');
    setActive(template?.isActive ?? true);
    setRows(template
      ? [...template.fields].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder)
        .map((f) => ({ rowKey: nextKey.current++, id: f.id, label: f.label, isRequired: f.isRequired, isActive: f.isActive }))
      : [{ rowKey: nextKey.current++, label: '', isRequired: false, isActive: true }]);
    setError('');
  }, [open, template]);

  const update = (key: number, patch: Partial<Row>) => setRows((p) => p.map((r) => (r.rowKey === key ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((p) => {
    const j = i + d;
    if (j < 0 || j >= p.length) return p;
    const n = [...p];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const save = useMutation({
    mutationFn: () => {
      const fields = rows.filter((r) => r.id || r.label.trim()).map((r) => ({ id: r.id, label: r.label.trim(), isRequired: r.isRequired, isActive: r.isActive }));
      return editing
        ? api.patch<MeasurementTemplate>(`/measurement-templates/${template!.id}`, { name: name.trim(), defaultUnit: unit, isActive: active, fields })
        : api.post<MeasurementTemplate>('/measurement-templates', { name: name.trim(), garmentCategory: category, defaultUnit: unit, fields });
    },
    onSuccess: (t) => {
      toast.success(editing ? `${t.name} updated` : `${t.name} created`);
      void qc.invalidateQueries({ queryKey: ['measurement-templates'] });
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = () => {
    const labels = rows.filter((r) => r.label.trim()).map((r) => r.label.trim().toLowerCase());
    if (name.trim().length < 2) return setError('Enter a template name');
    if (rows.some((r) => r.id && !r.label.trim())) return setError('Every field needs a name');
    if (!rows.some((r) => r.isActive && r.label.trim())) return setError('Add at least one active field');
    if (new Set(labels).size !== labels.length) return setError('Two fields have the same name');
    setError('');
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle><LayoutList className="h-5 w-5 text-primary" />{editing ? `Edit ${template!.name}` : 'New measurement template'}</DialogTitle>
          <DialogDescription>
            Fields are shown in this order when taking measurements. Turning a field off hides it for new measurements; old measurements keep their values.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="t-name">Template name</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Sherwani" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-cat">Garment type</Label>
              <NativeSelect id="t-cat" value={category} onChange={(e) => setCategory(e.target.value)} disabled={editing}>
                {GARMENT_CATEGORIES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-unit">Default unit</Label>
              <NativeSelect id="t-unit" value={unit} onChange={(e) => setUnit(e.target.value as 'INCH' | 'CM')}>
                <option value="INCH">Inches</option><option value="CM">Centimetres</option>
              </NativeSelect>
            </div>
            {editing && (
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} aria-label="Template active" /> Template in use
              </label>
            )}
          </div>

          <div className="rounded-md border">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Field</span><span className="w-16 text-center">Required</span><span className="w-12 text-center">In use</span><span className="w-24" />
            </div>
            <ul className="divide-y">
              {rows.map((r, i) => (
                <li key={r.rowKey} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-1.5">
                  <Input aria-label={`Field ${i + 1} name`} value={r.label} maxLength={60} placeholder="Field name" className={r.isActive ? '' : 'opacity-60'}
                    onChange={(e) => update(r.rowKey, { label: e.target.value })} />
                  <span className="flex w-16 justify-center"><Checkbox aria-label={`${r.label || 'Field'} required`} checked={r.isRequired} onCheckedChange={(v) => update(r.rowKey, { isRequired: v === true })} /></span>
                  <span className="flex w-12 justify-center"><Checkbox aria-label={`${r.label || 'Field'} in use`} checked={r.isActive} onCheckedChange={(v) => update(r.rowKey, { isActive: v === true })} /></span>
                  <span className="flex w-24 justify-end">
                    <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                    {!r.id && <Button type="button" size="icon" variant="ghost" aria-label="Remove field" onClick={() => setRows((p) => p.filter((x) => x.rowKey !== r.rowKey))}><Trash2 /></Button>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t p-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setRows((p) => [...p, { rowKey: nextKey.current++, label: '', isRequired: false, isActive: true }])}>
                <Plus /> Add field
              </Button>
            </div>
          </div>
          <FieldError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create template'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

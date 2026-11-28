import { GARMENT_CATEGORIES } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shirt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTemplates } from '@/features/measurements/CustomerMeasurements';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Garment } from '@/types';
import { formatPKR } from '@/utils/format';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const QTY = /^\d{1,8}(\.\d{1,3})?$/;
const CATEGORY_LABEL = Object.fromEntries(GARMENT_CATEGORIES.map((c) => [c.key, c.label]));

function GarmentDialog({ open, onOpenChange, garment }: { open: boolean; onOpenChange: (o: boolean) => void; garment: Garment | null }) {
  const qc = useQueryClient();
  const templates = useTemplates();
  const [f, setF] = useState({ name: '', category: 'CUSTOM', measurementTemplateId: '', defaultStitchingPrice: '', defaultFabricConsumption: '', defaultPieceRate: '', isActive: true });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setF({
      name: garment?.name ?? '', category: garment?.category ?? 'CUSTOM', measurementTemplateId: garment?.measurementTemplate?.id ?? '',
      defaultStitchingPrice: garment ? String(Number(garment.defaultStitchingPrice)) : '', defaultFabricConsumption: garment ? String(Number(garment.defaultFabricConsumption)) : '',
      defaultPieceRate: garment ? String(Number(garment.defaultPieceRate)) : '', isActive: garment?.isActive ?? true,
    });
  }, [open, garment]);
  const errors: Record<string, string | undefined> = {
    name: f.name.trim().length < 2 ? 'Enter the garment name' : undefined,
    price: f.defaultStitchingPrice && !MONEY.test(f.defaultStitchingPrice.trim()) ? 'Enter an amount like 2500' : undefined,
    fabric: f.defaultFabricConsumption && !QTY.test(f.defaultFabricConsumption.trim()) ? 'Enter meters like 4.5' : undefined,
    rate: f.defaultPieceRate && !MONEY.test(f.defaultPieceRate.trim()) ? 'Enter an amount like 600' : undefined,
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(), category: f.category, measurementTemplateId: f.measurementTemplateId || null,
        defaultStitchingPrice: f.defaultStitchingPrice.trim() || '0', defaultFabricConsumption: f.defaultFabricConsumption.trim() || '0',
        defaultPieceRate: f.defaultPieceRate.trim() || '0', isActive: f.isActive,
      };
      return garment ? api.patch<Garment>(`/garments/${garment.id}`, body) : api.post<Garment>('/garments', body);
    },
    onSuccess: (g) => {
      toast.success(garment ? 'Garment updated' : `${g.name} added`);
      void qc.invalidateQueries({ queryKey: ['garments'] });
      void qc.invalidateQueries({ queryKey: ['order-form-options'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: string) => (touched ? errors[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><Shirt className="h-5 w-5 text-primary" /> {garment ? `Edit ${garment.name}` : 'Add garment'}</DialogTitle>
          <DialogDescription>Default prices fill the order form automatically. They can still be changed on each order.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="g-name" required>Garment name</Label>
            <Input id="g-name" autoFocus maxLength={80} placeholder="e.g. Sherwani" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!err('name')} /><FieldError message={err('name')} /></div>
          <div className="space-y-1.5"><Label htmlFor="g-cat">Category</Label>
            <NativeSelect id="g-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{GARMENT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="g-tpl">Measurement template</Label>
            <NativeSelect id="g-tpl" value={f.measurementTemplateId} onChange={(e) => setF({ ...f, measurementTemplateId: e.target.value })}>
              <option value="">None</option>{templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="g-price">Stitching price (Rs)</Label>
            <Input id="g-price" inputMode="decimal" placeholder="0" value={f.defaultStitchingPrice} onChange={(e) => setF({ ...f, defaultStitchingPrice: e.target.value })} aria-invalid={!!err('price')} /><FieldError message={err('price')} /></div>
          <div className="space-y-1.5"><Label htmlFor="g-fab">Fabric per piece (meters)</Label>
            <Input id="g-fab" inputMode="decimal" placeholder="0" value={f.defaultFabricConsumption} onChange={(e) => setF({ ...f, defaultFabricConsumption: e.target.value })} aria-invalid={!!err('fabric')} /><FieldError message={err('fabric')} /></div>
          <div className="space-y-1.5"><Label htmlFor="g-rate">Tailor wage per piece (Rs)</Label>
            <Input id="g-rate" inputMode="decimal" placeholder="0" value={f.defaultPieceRate} onChange={(e) => setF({ ...f, defaultPieceRate: e.target.value })} aria-invalid={!!err('rate')} /><FieldError message={err('rate')} />
            <p className="text-[11px] text-muted-foreground">Used for per-piece wages in Payroll (Phase 5).</p></div>
          <label className="flex items-center gap-2 self-center text-sm"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} aria-label="Active" /> Active (shown on new orders)</label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{garment ? 'Save changes' : 'Add garment'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GarmentsPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Garment | null>(null);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['garments', 'all'], queryFn: () => api.get<Garment[]>('/garments', { all: 'true' }) });
  const edit = (g: Garment | null) => { setEditing(g); setOpen(true); };
  const canEdit = can('garments', 'EDIT');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['garments'] }); void qc.invalidateQueries({ queryKey: ['order-form-options'] }); };
  const columns: DataColumn<Garment>[] = [
    { id: 'name', header: 'Garment', value: (g) => g.name, cell: (g) => <span className="font-medium">{g.name}</span> },
    { id: 'category', header: 'Category', value: (g) => CATEGORY_LABEL[g.category] ?? g.category, className: 'hidden md:table-cell' },
    { id: 'template', header: 'Measurement form', value: (g) => g.measurementTemplate?.name ?? 'None', cell: (g) => g.measurementTemplate?.name ?? <span className="text-muted-foreground">None</span> },
    { id: 'price', header: 'Stitching price', type: 'money', value: (g) => g.defaultStitchingPrice,
      cell: (g) => (Number(g.defaultStitchingPrice) ? formatPKR(g.defaultStitchingPrice) : <span className="text-amber-700 dark:text-amber-300">Not set</span>) },
    { id: 'fabric', header: 'Fabric / piece', type: 'number', value: (g) => Number(g.defaultFabricConsumption), text: (g) => `${Number(g.defaultFabricConsumption)} m` },
    { id: 'wage', header: 'Tailor wage', type: 'money', value: (g) => g.defaultPieceRate, cell: (g) => formatPKR(g.defaultPieceRate), className: 'hidden lg:table-cell' },
    { id: 'pieces', header: 'Pieces ordered', type: 'number', value: (g) => g.piecesOrdered ?? 0, className: 'hidden lg:table-cell' },
    { id: 'status', header: 'Status', value: (g) => (g.isActive ? 'Active' : 'Inactive'), cell: (g) => (g.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
  ];
  const unpriced = q.data?.filter((g) => g.isActive && !Number(g.defaultStitchingPrice)).length ?? 0;

  return (
    <div>
      <PageHeader title="Garments" description="Garment types, default stitching prices and the measurement form each one uses."
        actions={can('garments', 'CREATE') && <Button onClick={() => edit(null)}><Plus /> Add garment</Button>} />
      {unpriced > 0 && canEdit && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {unpriced} garment(s) have no stitching price yet. Set your shop prices so new orders are filled in automatically.
        </p>
      )}
      <Card>
        <DataTable
          title="Garments"
          module="garments"
          noun="garment"
          rows={q.data}
          columns={columns}
          getRowId={(g) => g.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          defaultSort={{ id: 'name', desc: false }}
          onRowClick={canEdit ? (g) => edit(g) : undefined}
          onEdit={canEdit ? (g) => edit(g) : undefined}
          duplicateRow={can('garments', 'CREATE') ? (g) => api.post('/garments', {
            name: `${g.name} (Copy)`, category: g.category, measurementTemplateId: g.measurementTemplate?.id ?? null,
            defaultStitchingPrice: g.defaultStitchingPrice, defaultFabricConsumption: g.defaultFabricConsumption, defaultPieceRate: g.defaultPieceRate, isActive: g.isActive,
          }) : undefined}
          deleteRow={can('garments', 'DELETE') ? (g) => api.delete(`/garments/${g.id}`) : undefined}
          deleteWarning="Garments already used on orders cannot be deleted; mark them inactive instead."
          onChanged={refresh}
          importer={can('garments', 'CREATE') ? {
            fields: [
              { key: 'name', label: 'Name', required: true, example: 'Sherwani' },
              { key: 'category', label: 'Category', example: 'CUSTOM' },
              { key: 'defaultStitchingPrice', label: 'Stitching price', example: '2500' },
              { key: 'defaultFabricConsumption', label: 'Fabric per piece', example: '4.5' },
              { key: 'defaultPieceRate', label: 'Tailor wage', example: '600' },
            ],
            note: `Category: ${GARMENT_CATEGORIES.map((c) => c.key).join(', ')}.`,
            createRow: (d) => {
              const cat = (d.category || 'CUSTOM').toUpperCase().replace(/[^A-Z]+/g, '_');
              return api.post('/garments', {
                name: d.name, category: GARMENT_CATEGORIES.some((c) => c.key === cat) ? cat : 'CUSTOM', measurementTemplateId: null,
                defaultStitchingPrice: d.defaultStitchingPrice || '0', defaultFabricConsumption: d.defaultFabricConsumption || '0', defaultPieceRate: d.defaultPieceRate || '0', isActive: true,
              });
            },
          } : undefined}
          empty={<EmptyState icon={<Shirt />} title="No garments yet" description="Add the garments you stitch, with their prices." />}
          mobileCard={(g) => (
            <button type="button" disabled={!canEdit} onClick={() => edit(g)} className="flex w-full items-center gap-3 px-1 py-3 text-left">
              <span className="icon-tile h-11 w-11 shrink-0 rounded-xl bg-gold-soft text-[#8a6a1f] dark:text-gold"><Shirt className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{g.name}</span>
                <span className="block text-xs text-muted-foreground">{g.measurementTemplate?.name ?? 'No measurement form'} · {Number(g.defaultFabricConsumption)} m</span>
              </span>
              <span className="flex flex-col items-end gap-1"><span className="font-semibold tabular-nums">{formatPKR(g.defaultStitchingPrice)}</span>{!g.isActive && <Badge variant="secondary">Inactive</Badge>}</span>
            </button>
          )}
        />
      </Card>
      <GarmentDialog open={open} onOpenChange={setOpen} garment={editing} />
    </div>
  );
}

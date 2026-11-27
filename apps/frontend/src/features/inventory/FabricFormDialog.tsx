import { FABRIC_UNITS, unitShort } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Fabric, FabricCategory, FabricDetail, Paginated, Supplier } from '@/types';
import { MONEY_RE, QTY_RE } from './shared';

const EMPTY = {
  name: '', brand: '', categoryId: '', color: '', design: '', quality: '', supplierId: '', purchasePrice: '', salePrice: '',
  unit: 'METER', minimumStock: '', location: '', isActive: true, openingStock: '', openingCost: '',
};

const num = (v: string) => (Number(v) ? String(Number(v)) : '');

export function useFabricCategories() {
  return useQuery({ queryKey: ['inventory', 'categories'], queryFn: () => api.get<FabricCategory[]>('/inventory/categories') });
}

/** Add or edit a fabric. Stock itself is never typed here: it changes only through purchases, orders and adjustments. */
export function FabricFormDialog({ open, onOpenChange, fabric, onSaved, hideOpening }: {
  open: boolean; onOpenChange: (o: boolean) => void; fabric: Fabric | null; onSaved?: (f: FabricDetail) => void;
  /** From the purchase form: stock comes from the purchase itself. */
  hideOpening?: boolean;
}) {
  const qc = useQueryClient();
  const can = useCan();
  const categories = useFabricCategories();
  const suppliers = useQuery({
    queryKey: ['suppliers', 'options-all'], enabled: open && can('suppliers', 'VIEW'),
    queryFn: () => api.get<Paginated<Supplier>>('/suppliers', { pageSize: 200, status: 'ACTIVE' }),
  });
  const [f, setF] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setF(fabric ? {
      name: fabric.name, brand: fabric.brand ?? '', categoryId: fabric.category?.id ?? '', color: fabric.color ?? '', design: fabric.design ?? '',
      quality: fabric.quality ?? '', supplierId: fabric.supplier?.id ?? '', purchasePrice: num(fabric.purchasePrice), salePrice: num(fabric.salePrice),
      unit: fabric.unit, minimumStock: num(fabric.minimumStock), location: fabric.location ?? '', isActive: fabric.isActive, openingStock: '', openingCost: '',
    } : EMPTY);
  }, [open, fabric]);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const errors: Record<string, string | undefined> = {
    name: f.name.trim().length < 2 ? 'Enter the fabric name' : undefined,
    purchasePrice: f.purchasePrice && !MONEY_RE.test(f.purchasePrice.trim()) ? 'Enter an amount like 850' : undefined,
    salePrice: f.salePrice && !MONEY_RE.test(f.salePrice.trim()) ? 'Enter an amount like 1200' : undefined,
    minimumStock: f.minimumStock && !QTY_RE.test(f.minimumStock.trim()) ? 'Enter a number like 20' : undefined,
    openingStock: f.openingStock && !QTY_RE.test(f.openingStock.trim()) ? 'Enter a number like 50 or 12.5' : undefined,
    openingCost: f.openingCost && !MONEY_RE.test(f.openingCost.trim()) ? 'Enter an amount like 850' : undefined,
  };
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: f.name.trim(), brand: f.brand, categoryId: f.categoryId || null, color: f.color, design: f.design, quality: f.quality,
        supplierId: f.supplierId || null, purchasePrice: f.purchasePrice.trim() || '0', salePrice: f.salePrice.trim() || '0', unit: f.unit,
        minimumStock: f.minimumStock.trim() || '0', location: f.location, isActive: f.isActive,
      };
      if (!fabric) {
        if (f.openingStock.trim()) body.openingStock = f.openingStock.trim();
        if (f.openingCost.trim()) body.openingCost = f.openingCost.trim();
        return api.post<FabricDetail>('/inventory/fabrics', body);
      }
      return api.patch<FabricDetail>(`/inventory/fabrics/${fabric.id}`, body);
    },
    onSuccess: (saved) => {
      toast.success(fabric ? 'Fabric updated' : `${saved.name} added as ${saved.code}`);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: string) => (touched ? errors[k] : undefined);
  const u = unitShort(f.unit);
  const supplierList = suppliers.data?.data ?? (fabric?.supplier ? [fabric.supplier] : []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><Layers className="h-5 w-5 text-primary" /> {fabric ? `Edit ${fabric.code}` : 'Add fabric'}</DialogTitle>
          <DialogDescription>{fabric ? 'Stock is changed only by purchases, orders and stock adjustments.' : 'A fabric code is created automatically. Enter the stock you have now as opening stock.'}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="f-name" required>Fabric name</Label>
            <Input id="f-name" autoFocus maxLength={120} placeholder="e.g. Premium Wash & Wear" value={f.name} onChange={set('name')} aria-invalid={!!err('name')} /><FieldError message={err('name')} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-cat">Category</Label>
            <NativeSelect id="f-cat" value={f.categoryId} onChange={set('categoryId')}>
              <option value="">No category</option>
              {categories.data?.filter((c) => c.isActive || c.id === f.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="f-brand">Brand</Label><Input id="f-brand" maxLength={80} placeholder="e.g. Gul Ahmed" value={f.brand} onChange={set('brand')} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-color">Colour</Label><Input id="f-color" maxLength={60} placeholder="e.g. Off white" value={f.color} onChange={set('color')} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-design">Design</Label><Input id="f-design" maxLength={80} placeholder="e.g. Plain, Self check" value={f.design} onChange={set('design')} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-quality">Quality</Label><Input id="f-quality" maxLength={80} placeholder="e.g. Export quality" value={f.quality} onChange={set('quality')} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-unit">Unit</Label>
            <NativeSelect id="f-unit" value={f.unit} onChange={set('unit')} disabled={!!fabric && Number(fabric.currentStock) > 0}>
              {FABRIC_UNITS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="f-pp">Purchase price (Rs per {u})</Label>
            <Input id="f-pp" inputMode="decimal" placeholder="0" value={f.purchasePrice} onChange={set('purchasePrice')} aria-invalid={!!err('purchasePrice')} /><FieldError message={err('purchasePrice')} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-sp">Sale price (Rs per {u})</Label>
            <Input id="f-sp" inputMode="decimal" placeholder="0" value={f.salePrice} onChange={set('salePrice')} aria-invalid={!!err('salePrice')} /><FieldError message={err('salePrice')} />
            <p className="text-[11px] text-muted-foreground">Filled in automatically on orders that use this fabric.</p></div>
          <div className="space-y-1.5"><Label htmlFor="f-min">Minimum stock ({u})</Label>
            <Input id="f-min" inputMode="decimal" placeholder="0" value={f.minimumStock} onChange={set('minimumStock')} aria-invalid={!!err('minimumStock')} /><FieldError message={err('minimumStock')} />
            <p className="text-[11px] text-muted-foreground">You get a low stock alert at this level.</p></div>
          <div className="space-y-1.5"><Label htmlFor="f-loc">Location</Label><Input id="f-loc" maxLength={80} placeholder="e.g. Rack A-3" value={f.location} onChange={set('location')} /></div>
          <div className="space-y-1.5"><Label htmlFor="f-sup">Usual supplier</Label>
            <NativeSelect id="f-sup" value={f.supplierId} onChange={set('supplierId')} disabled={!can('suppliers', 'VIEW')}>
              <option value="">Not set</option>
              {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </NativeSelect></div>
          {!fabric && !hideOpening && (
            <div className="grid gap-3 rounded-xl border border-dashed border-primary/50 bg-gold-soft/30 p-3 sm:col-span-2 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="f-open">Opening stock ({u})</Label>
                <Input id="f-open" inputMode="decimal" placeholder="0" value={f.openingStock} onChange={set('openingStock')} aria-invalid={!!err('openingStock')} /><FieldError message={err('openingStock')} /></div>
              <div className="space-y-1.5"><Label htmlFor="f-ocost">Cost of opening stock (Rs per {u})</Label>
                <Input id="f-ocost" inputMode="decimal" placeholder="Same as purchase price" value={f.openingCost} onChange={set('openingCost')} aria-invalid={!!err('openingCost')} /><FieldError message={err('openingCost')} /></div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} aria-label="Active" /> Active (can be used on new orders and purchases)</label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{fabric ? 'Save changes' : 'Add fabric'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Layers, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import type { FabricOption } from '@/types';
import { cn } from '@/utils/cn';
import { formatPKR } from '@/utils/format';
import { StockLevelBadge, formatQty } from './shared';

export type PickedFabric = Pick<FabricOption, 'id' | 'code' | 'name' | 'unit' | 'salePrice' | 'purchasePrice' | 'availableStock' | 'color'> & { currentStock?: string };

/**
 * Search-as-you-type fabric selector showing free stock.
 * `source` = 'orders' for the order form (works for staff without Inventory access), 'inventory' elsewhere.
 */
export function FabricPicker({ value, onChange, source = 'inventory', invalid, disabled, placeholder, extraFree = 0 }: {
  value: PickedFabric | null; onChange: (f: PickedFabric | null) => void; source?: 'orders' | 'inventory'; invalid?: boolean;
  disabled?: boolean; placeholder?: string; extraFree?: number;
}) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const results = useQuery({
    queryKey: ['fabric-options', source, debounced],
    queryFn: () => api.get<FabricOption[]>(source === 'orders' ? '/orders/fabric-options' : '/inventory/fabric-options', { search: debounced }),
    enabled: open && !value,
  });

  if (value) {
    const free = Number(value.availableStock) + extraFree;
    return (
      <div className={cn('flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-1.5', invalid && 'border-destructive')}>
        <span className="icon-tile h-8 w-8 shrink-0 rounded-lg bg-gold-soft text-[#8a6a1f] dark:text-gold"><Layers className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{value.name}{value.color ? ` - ${value.color}` : ''}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{value.code} · {formatQty(free, value.unit)} free · {formatPKR(value.salePrice)}</span>
        </span>
        {!disabled && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Change fabric" onClick={() => { onChange(null); setText(''); setOpen(true); }}><X /></Button>}
      </div>
    );
  }
  return (
    <div className="relative" ref={boxRef}>
      <Layers className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
      <Input className="pl-8" placeholder={placeholder ?? 'Search fabric by code, name or colour'} value={text} aria-label="Select fabric" aria-invalid={invalid} disabled={disabled}
        onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} />
      {open && (
        <div className="absolute inset-x-0 top-11 z-40 max-h-72 overflow-y-auto rounded-lg border bg-card shadow-lg" role="listbox">
          {results.isFetching && !results.data ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching...</p>
          ) : !results.data?.length ? (
            <p className="p-3 text-sm text-muted-foreground">{debounced ? 'No fabric found.' : 'No fabrics in stock yet. Add fabrics in Fabric Inventory.'}</p>
          ) : results.data.map((f) => (
            <button key={f.id} type="button" role="option" aria-selected={false} onClick={() => { onChange(f); setOpen(false); }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{f.name}{f.color ? ` - ${f.color}` : ''}</span>
                <span className="block text-xs text-muted-foreground">{f.code}{f.category ? ` · ${f.category}` : ''} · {formatPKR(f.salePrice)}</span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-xs font-semibold tabular-nums">{formatQty(f.availableStock, f.unit)}</span>
                <StockLevelBadge level={f.level} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
